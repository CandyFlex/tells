/**
 * audit.mjs: the adversarial check. Arithmetic on the document, never trust
 * in the report.
 *
 * A report is a set of claims: "this text sits at this line and column",
 * "this rule fired 12 times", "that is 14.46 per 1,000 words". The audit
 * takes the document the report says it describes and recomputes every one
 * of those claims, or compares it to a constant this version of the tool
 * carries. It reads no summary and takes no stated figure on faith.
 *
 * THE RULE: every field of a report is either recomputed here from the
 * document, or compared to a value pinned in this source tree. A field that
 * can be neither may not be in the report.
 *
 * What it checks, in order:
 *
 *   A  structure   schema; the reproduce command agrees with the recorded
 *                  options; the limits block and its citation are word for
 *                  word unmodified; every rule's name, category, weight and
 *                  baseline match the registry for this version; observedAt
 *                  is a timestamp; every key is one the schema defines
 *   B  identity    the document's sha256 and its counts match the report
 *   C  location    every finding's match AND its excerpt are rebuilt from
 *                  the document at the recorded line, column and length
 *   D  arithmetic  count, per1k, aboveBaseline, totals, the statistics block,
 *                  the rates block and the partial-run block all recompute
 *   E  replay      running the same rules with the recorded options over the
 *                  document yields exactly the findings reported: none
 *                  invented, none removed
 *
 * E is what catches a deleted finding. C and D would pass a report that had
 * quietly dropped its worst line and fixed up the counts.
 *
 * WHAT THE AUDIT CANNOT KNOW, stated here and in the README:
 *
 *   - that the document handed to it is the document the writer wrote. It
 *     proves a report and a text agree, not where the text came from.
 *   - when the report was made. `observedAt` is checked for shape only. There
 *     is no signature and no trusted clock; a stamp can say anything.
 *   - who ran it, or on whose machine. `document.path` and `command` are
 *     strings the report carries; only their internal consistency is checked.
 *   - whether a rule is any good. The audit proves the arithmetic, not the
 *     linguistics.
 *
 * Exit codes (CLI): 0 = clean, 1 = a FAIL was found.
 */

import { parseDocument, per1k } from './document.mjs';
import { describe } from './stats.mjs';
import { sha256 } from './sha256.mjs';
import {
  SCHEMA, VERSION, LIMITS, LIMITS_SOURCE, reportKeyProblems, runRules, totalsOf,
  normaliseOptions, partialRunOf, ratesOf, ratesComparable,
} from './report.mjs';
import { RULE_IDS, getRule } from './rules/index.mjs';

const CRITICAL = 'CRITICAL';
const WARN = 'WARN';

const finding = (level, id, message, detail = null) => ({ level, id, message, detail });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const key = (f) => `${f.line}:${f.col}:${f.length}:${f.note ?? ''}:${f.aggregate ? 'a' : ''}:${f.weight ?? ''}`;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

/** The value of a repeatable flag in a recorded command line. */
function flagList(cmd, name) {
  const m = new RegExp(`--${name}(?:=|\\s+)("[^"]*"|\\S+)`).exec(cmd);
  return m ? m[1].replace(/^"|"$/g, '').split(',').map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * A2/A8. The reproduce command must select the same rules the report says it
 * ran. A report analysed with `--ignore <every rule>` and then relabelled
 * `tells draft.md` prints "No findings." over a command that would have found
 * them, which is the cheapest forgery in the set.
 */
function auditCommand(report) {
  const cmd = String(report?.command ?? '');
  if (!cmd) return [finding(CRITICAL, 'A2', 'no reproduce command recorded')];
  if (!/^tells(\s|$)/.test(cmd)) return [finding(CRITICAL, 'A2', `the reproduce command does not run tells: "${cmd}"`)];
  if (cmd === 'tells (api)') return []; // a library call has no command line to disagree with
  const out = [];
  const o = normaliseOptions(report.options);
  const says = (name) => new RegExp(`(?:^|\\s)--${name}(?:\\s|$)`).test(cmd);
  for (const k of ['plain', 'historical']) {
    if (says(k) !== o[k]) {
      out.push(finding(CRITICAL, 'A8', `options.${k} is ${o[k]} but the reproduce command ${says(k) ? 'passes' : 'does not pass'} --${k}`, cmd));
    }
  }
  for (const k of ['only', 'ignore', 'include']) {
    const said = flagList(cmd, k).slice().sort();
    if (!same(said, [...o[k]].sort())) {
      out.push(finding(CRITICAL, 'A8', `options.${k} is [${o[k].join(', ')}] but the reproduce command says [${said.join(', ')}]`, cmd));
    }
  }
  return out;
}

/** A10. Rule metadata is the registry's to state, not the report's to claim. */
function auditRuleMetadata(report) {
  const out = [];
  for (const r of report?.rules ?? []) {
    const rule = getRule(r.id);
    if (!rule) continue; // D4 reports the unknown id
    for (const k of ['name', 'category', 'weight']) {
      if (r[k] !== rule[k]) out.push(finding(CRITICAL, 'A10', `${r.id}: ${k} says "${r[k]}", the registry for tells ${VERSION} says "${rule[k]}"`));
    }
    if (!same(r.baseline ?? null, rule.baseline ?? null)) {
      out.push(finding(CRITICAL, 'A10', `${r.id}: the baseline does not match the registry for tells ${VERSION}`, `report ${JSON.stringify(r.baseline)}, registry ${JSON.stringify(rule.baseline)}`));
    }
  }
  return out;
}

/** A. Does the report even describe what it is and what it refuses to be? */
function auditStructure(report) {
  const out = [];
  if (report?.schema !== SCHEMA) out.push(finding(CRITICAL, 'A1', `unknown schema "${report?.schema}"`));
  out.push(...auditCommand(report));
  if (!Array.isArray(report?.limits)) {
    out.push(finding(CRITICAL, 'A3', 'the limits block is missing'));
  } else if (!same(report.limits, LIMITS)) {
    out.push(finding(CRITICAL, 'A4', 'the limits block has been modified'));
  }
  for (const { path, why } of reportKeyProblems(report)) {
    out.push(finding(CRITICAL, 'A5', `unexpected key "${path}": ${why}`));
  }
  if (!Array.isArray(report?.rules)) out.push(finding(CRITICAL, 'A6', 'no rules array'));
  if (report?.tool?.version && report.tool.version !== VERSION) {
    out.push(finding(WARN, 'A7', `report written by tells ${report.tool.version}, audited by ${VERSION}; rule changes between versions will show up as replay differences`));
  }
  if (!same(report?.limitsSource ?? null, { ...LIMITS_SOURCE })) {
    out.push(finding(CRITICAL, 'A9', 'the citation under the limits block has been modified', `report ${JSON.stringify(report?.limitsSource)}`));
  }
  out.push(...auditRuleMetadata(report));
  if (!ISO.test(String(report?.observedAt ?? ''))) {
    out.push(finding(CRITICAL, 'A11', `observedAt is not a timestamp: "${report?.observedAt}"`));
  }
  return out;
}

/** B. Is this the document the report was made from? */
function auditIdentity(report, doc, documentText) {
  const out = [];
  const hash = sha256(doc.raw);
  if (report.document?.sha256 !== hash) {
    out.push(finding(CRITICAL, 'B1', 'document sha256 does not match: this is not the text the report describes', `report ${String(report.document?.sha256).slice(0, 12)}, document ${hash.slice(0, 12)}`));
  }
  for (const k of ['words', 'sentences', 'paragraphs', 'lines', 'chars']) {
    if (report.document?.[k] !== doc.counts[k]) {
      out.push(finding(CRITICAL, 'B2', `document.${k} is ${report.document?.[k]} in the report and ${doc.counts[k]} in the document`));
    }
  }
  // The byte hash is a convenience for tools that run sha256sum, not the
  // identity check: a CRLF checkout of the same prose is the same document.
  const bytes = sha256(documentText);
  if (report.document?.bytesSha256 !== undefined && report.document.bytesSha256 !== bytes) {
    out.push(finding(WARN, 'B3', 'document.bytesSha256 does not match these file bytes; the normalised text still does, so this is a line-ending or BOM difference', `report ${String(report.document.bytesSha256).slice(0, 12)}, file ${bytes.slice(0, 12)}`));
  }
  return out;
}

/** C. Every finding must be where it says it is. */
function auditLocations(report, doc) {
  const out = [];
  for (const r of report.rules ?? []) {
    for (const f of r.findings ?? []) {
      const offset = doc.offsetOf(f.line, f.col);
      const actual = offset < 0 ? null : doc.raw.slice(offset, offset + f.length);
      if (actual !== f.match) {
        out.push(finding(CRITICAL, 'C1', `${r.id}: "${String(f.match).slice(0, 40)}" is not at ${f.line}:${f.col}`, actual === null ? 'no such line' : `found "${actual.slice(0, 40)}"`));
      }
      if (f.offset !== undefined && f.offset !== offset) {
        out.push(finding(CRITICAL, 'C2', `${r.id}: offset ${f.offset} disagrees with ${f.line}:${f.col}`));
      }
      // The excerpt is the only place a report quotes the writer's own
      // sentences, and it is the line a reader actually reads. Rebuild it.
      if (offset >= 0 && f.excerpt !== undefined) {
        const excerpt = doc.excerpt(offset, f.length);
        if (excerpt !== f.excerpt) {
          out.push(finding(CRITICAL, 'C3', `${r.id}: the excerpt at ${f.line}:${f.col} is not the document's words`, `report "${String(f.excerpt).slice(0, 60)}", document "${excerpt.slice(0, 60)}"`));
        }
      }
    }
  }
  return out;
}

/** D. The figures must follow from the findings. */
function auditArithmetic(report, doc) {
  const out = [];
  for (const r of report.rules ?? []) {
    const findings = r.findings ?? [];
    const count = findings.filter((f) => !f.aggregate).length;
    if (r.count !== count) out.push(finding(CRITICAL, 'D1', `${r.id}: count says ${r.count}, findings say ${count}`));
    const rate = per1k(count, doc.counts.words);
    if (r.per1k !== rate) out.push(finding(CRITICAL, 'D2', `${r.id}: per1k says ${r.per1k}, recomputed ${rate} (${count} in ${doc.counts.words} words)`));
    const above = r.baseline && ratesComparable(doc.counts.words) ? rate > r.baseline.per1k : null;
    if (r.aboveBaseline !== above) out.push(finding(CRITICAL, 'D3', `${r.id}: aboveBaseline says ${r.aboveBaseline}, recomputed ${above}`));
    if (!RULE_IDS.includes(r.id)) out.push(finding(CRITICAL, 'D4', `unknown rule "${r.id}"`));
  }
  if (Array.isArray(report.rules)) {
    const totals = totalsOf(report.rules);
    if (!same(report.totals, totals)) {
      out.push(finding(CRITICAL, 'D5', 'totals do not match the findings', `report ${JSON.stringify(report.totals)}, recomputed ${JSON.stringify(totals)}`));
    }
    const partial = partialRunOf(report.rules, normaliseOptions(report.options));
    if (!same(report.partialRun ?? null, partial)) {
      out.push(finding(CRITICAL, 'D8', 'the partial-run block does not match the recorded options', `report ${JSON.stringify(report.partialRun ?? null)}, recomputed ${JSON.stringify(partial)}`));
    }
  }
  // The statistics block is prose-shaped and easy to overlook, which is why a
  // doctored one ("mean 0.1 words, n=9999") used to survive the audit.
  const stats = describe(doc);
  if (!same(report.stats ?? null, stats)) {
    const differs = Object.keys(stats).filter((k) => !same(report.stats?.[k], stats[k]));
    out.push(finding(CRITICAL, 'D6', `the statistics block does not describe this document (${differs.join(', ') || 'missing'})`));
  }
  const rates = ratesOf(doc.counts.words);
  if (!same(report.rates ?? null, rates)) {
    out.push(finding(CRITICAL, 'D7', 'the rates block does not match the document length', `report ${JSON.stringify(report.rates)}, recomputed ${JSON.stringify(rates)}`));
  }
  return out;
}

/** E. Run it again. Nothing invented, nothing removed. */
function auditReplay(report, doc) {
  const out = [];
  let fresh;
  try {
    fresh = runRules(doc, normaliseOptions(report.options));
  } catch (e) {
    return [finding(CRITICAL, 'E1', `cannot replay with the recorded options: ${e.message}`)];
  }
  const freshIds = fresh.map((r) => r.id);
  const reportIds = (report.rules ?? []).map((r) => r.id);
  if (!same(freshIds, reportIds)) {
    out.push(finding(CRITICAL, 'E2', 'the rules in the report are not the rules its options select', `report [${reportIds.join(', ')}], options select [${freshIds.join(', ')}]`));
  }
  for (const f of fresh) {
    const r = (report.rules ?? []).find((x) => x.id === f.id);
    if (!r) continue;
    const have = new Set((r.findings ?? []).map(key));
    const want = new Set(f.findings.map(key));
    const removed = f.findings.filter((x) => !have.has(key(x)));
    const invented = (r.findings ?? []).filter((x) => !want.has(key(x)));
    for (const x of removed) out.push(finding(CRITICAL, 'E3', `${f.id}: a finding at ${x.line}:${x.col} ("${x.match.slice(0, 40)}") is missing from the report`));
    for (const x of invented) out.push(finding(CRITICAL, 'E4', `${f.id}: the report has a finding at ${x.line}:${x.col} that the rule does not produce`));
  }
  return out;
}

/**
 * Audit a report against the document it claims to describe.
 *
 * @param {object} report        a parsed tells/report@1
 * @param {string} documentText  the document, as a string
 * @returns {{ok: boolean, findings: Array, counts: {critical: number, warn: number}, checked: object}}
 */
export function audit(report, documentText) {
  if (typeof documentText !== 'string') throw new Error('audit: the document text is required; a report cannot be audited against nothing');
  const findings = auditStructure(report);
  let checked = { findings: 0, rules: 0 };
  if (report && typeof report === 'object' && Array.isArray(report.rules)) {
    const doc = parseDocument(documentText, { plain: !!report.options?.plain });
    findings.push(...auditIdentity(report, doc, documentText), ...auditLocations(report, doc), ...auditArithmetic(report, doc), ...auditReplay(report, doc));
    checked = { findings: report.rules.reduce((n, r) => n + (r.findings?.length ?? 0), 0), rules: report.rules.length };
  }
  const critical = findings.filter((f) => f.level === CRITICAL).length;
  return { ok: critical === 0, findings, counts: { critical, warn: findings.length - critical }, checked };
}

/** Human-readable audit result. */
export function formatAudit(result) {
  const lines = [];
  for (const f of result.findings) {
    lines.push(`  ${f.level === CRITICAL ? 'FAIL' : 'WARN'}  ${f.id}  ${f.message}${f.detail ? ` (${f.detail})` : ''}`);
  }
  lines.push(
    result.ok
      ? `${lines.length ? '\n' : ''}  PASS  ${result.checked.findings} findings in ${result.checked.rules} rules recomputed from the document. ${result.counts.warn} warning(s), 0 critical.`
      : `\n  FAIL  ${result.counts.critical} critical, ${result.counts.warn} warning(s). This report does not describe this document.`,
  );
  return lines.join('\n');
}
