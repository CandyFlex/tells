#!/usr/bin/env node
/**
 * tells: command line.
 *
 * Exit code 0 by default. This is diagnosis, not a gate: a document full of
 * findings is still a document, and nothing here knows who wrote it. Two
 * opt-in gates exist for pipelines that want them:
 *
 *   --fail-on strong    exit 1 only when an artifact-category rule fires
 *                       (chat residue or model debris, the one class where a
 *                       single hit is real evidence of anything)
 *   --max rule=N        exit 1 when a rule's count exceeds N
 *
 * `audit` exits 1 on any failure. Usage errors exit 2.
 *
 * Every command that prints a figure ends with the command that reproduces it.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { analyze, VERSION } from '../src/report.mjs';
import { format, formatRules, FORMATS } from '../src/format.mjs';
import { audit, formatAudit } from '../src/audit.mjs';
import { render } from '../src/render.mjs';
import { redact } from '../src/redact.mjs';
import { formatCorpus } from '../src/corpus.mjs';
import { RULE_IDS, getRule } from '../src/rules/index.mjs';
import { runCorpusDir } from '../src/node/corpus.mjs';

const VALUE_FLAGS = new Set(['format', 'only', 'ignore', 'include', 'out', 'fail-on', 'max', 'against', 'date', 'title', 'caption']);
const BOOL_FLAGS = new Set(['plain', 'historical', 'help', 'version']);
const FAIL_ON = ['strong', 'moderate', 'any'];

class UsageError extends Error {}

const HELP = `tells ${VERSION}: a linter for prose that reads as machine-written

It returns the passages that match known signs of LLM-generated text, each with
a rule, a line and column, and a count. It does not produce a probability, it
cannot determine authorship, and it does not rewrite anything.

  tells <file|-> [--format text|json|md|sarif] [--plain] [--historical]
        [--only rule,rule] [--ignore rule,rule] [--include rule,rule]
        [--out file] [--fail-on strong|moderate|any] [--max rule=N ...]
  tells rules                           list rules with weight, baseline, source
  tells audit <report.json> --against <file>
                                        recompute the report from the document; exit 1 on any failure
  tells render <file> [--out file.html] annotated HTML view with margin notes
  tells redact <report.json> [--out file]
                                        withhold the path and command; still passes audit
  tells corpus [dir] [--date YYYY-MM-DD]
                                        run over corpus/, print the rates table, write results.json

  --plain        turn Markdown-aware masking off (URLs are still masked)
  --historical   turn on every off-by-default rule
  --include      turn on one off-by-default rule, e.g. --include rule-of-three
  --fail-on      strong: exit 1 only when chat residue or model debris is found
                 moderate: also on any moderate finding. any: on any finding.
  --max          exit 1 when a rule's count exceeds N, e.g. --max em-dash=5

Exit code is 0 unless a gate you asked for trips (1) or the usage is wrong (2).
Rules: ${RULE_IDS.join(', ')}
`;

function parseArgs(argv) {
  const flags = { max: [] };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-' || !a.startsWith('--')) { positional.push(a); continue; }
    const eq = a.indexOf('=');
    const name = a.slice(2, eq === -1 ? undefined : eq);
    if (BOOL_FLAGS.has(name)) { flags[name] = true; continue; }
    if (!VALUE_FLAGS.has(name)) throw new UsageError(`unknown option --${name}`);
    const value = eq === -1 ? argv[++i] : a.slice(eq + 1);
    if (value === undefined || (eq === -1 && value.startsWith('--'))) throw new UsageError(`--${name} needs a value`);
    if (name === 'max') flags.max.push(value); else flags[name] = value;
  }
  return { flags, positional };
}

const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const quote = (a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

function readInput(file) {
  if (file === '-') return readFileSync(0, 'utf8');
  try {
    return readFileSync(file, 'utf8');
  } catch (e) {
    throw new UsageError(`cannot read ${file}: ${e.code ?? e.message}`);
  }
}

function writeOut(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text.endsWith('\n') ? text : `${text}\n`);
}

function parseMax(values) {
  return values.map((v) => {
    const m = /^([a-z-]+)=(\d+)$/.exec(v);
    if (!m) throw new UsageError(`--max takes rule=N, got "${v}"`);
    if (!getRule(m[1])) throw new UsageError(`--max: unknown rule "${m[1]}". Known rules: ${RULE_IDS.join(', ')}`);
    return { id: m[1], max: Number(m[2]) };
  });
}

/**
 * Which opt-in gates tripped. Returns reasons; empty means exit 0.
 *
 * Weight and category come from the registry, never from the report. A report
 * is a document; the gate is a decision, and a decision reads the rule as this
 * build defines it. Relabelling chat-residue as "vocabulary" in a JSON file
 * must not talk --fail-on strong out of firing.
 */
function gates(report, failOn, maxes) {
  const reasons = [];
  if (failOn) {
    const hit = (pred) => report.rules.flatMap((r) => r.findings.filter((f) => pred(getRule(r.id) ?? r, f)).map(() => r.id));
    const weightOf = (r, f) => f.weight ?? r.weight;
    let ids = [];
    if (failOn === 'strong') ids = hit((r, f) => r.category === 'artifact' && weightOf(r, f) === 'strong');
    if (failOn === 'moderate') ids = hit((r, f) => weightOf(r, f) !== 'weak');
    if (failOn === 'any') ids = hit(() => true);
    if (ids.length) reasons.push(`--fail-on ${failOn}: ${ids.length} finding(s) in ${[...new Set(ids)].join(', ')}`);
  }
  for (const { id, max } of maxes) {
    const r = report.rules.find((x) => x.id === id);
    if (r && r.count > max) reasons.push(`--max ${id}=${max}: count is ${r.count}`);
  }
  return reasons;
}

function main(argv) {
  const { flags, positional } = parseArgs(argv);
  if (flags.version) return console.log(VERSION);
  if (flags.help || !positional.length) {
    console.log(HELP);
    return flags.help ? undefined : process.exit(2);
  }
  const command = `tells ${argv.map(quote).join(' ')}`;
  const [cmd, ...rest] = positional;

  if (cmd === 'rules') return console.log(formatRules());

  if (cmd === 'audit') {
    if (!rest[0] || !flags.against) throw new UsageError('audit needs a report and the document: tells audit <report.json> --against <file>');
    let report;
    try {
      report = JSON.parse(readInput(rest[0]));
    } catch (e) {
      if (e instanceof UsageError) throw e;
      throw new UsageError(`${rest[0]} is not JSON: ${e.message}`);
    }
    const result = audit(report, readInput(flags.against));
    console.log(`\n  ${rest[0]} against ${flags.against}`);
    console.log(formatAudit(result));
    console.log(`\n  reproduce: ${command}`);
    return process.exit(result.ok ? 0 : 1);
  }

  if (cmd === 'redact') {
    if (!rest[0]) throw new UsageError('redact needs a report: tells redact <report.json> [--out file]');
    const out = JSON.stringify(redact(JSON.parse(readInput(rest[0])), { when: flags.date }), null, 2);
    return flags.out ? (writeOut(flags.out, out), console.error(`wrote ${flags.out}`)) : console.log(out);
  }

  if (cmd === 'corpus') {
    const dir = rest[0] ?? 'corpus';
    const observedAt = flags.date ?? new Date().toISOString().slice(0, 10);
    const results = runCorpusDir(dir, { observedAt, command: `tells corpus${rest[0] ? ` ${quote(rest[0])}` : ''} --date ${observedAt}` });
    writeOut(join(dir, 'results.json'), JSON.stringify(results, null, 2));
    console.log(formatCorpus(results));
    console.error(`wrote ${join(dir, 'results.json').split('\\').join('/')}`);
    return undefined;
  }

  const isRender = cmd === 'render';
  const file = isRender ? rest[0] : cmd;
  if (!file) throw new UsageError('render needs a file: tells render <file> [--out file.html]');
  if ((isRender ? rest.length : positional.length) > 1) throw new UsageError('one document at a time, so every report has one reproduce command');
  const kind = flags.format ?? 'text';
  if (!FORMATS.includes(kind)) throw new UsageError(`unknown format "${kind}". Use one of: ${FORMATS.join(', ')}`);
  if (flags['fail-on'] && !FAIL_ON.includes(flags['fail-on'])) throw new UsageError(`--fail-on takes one of: ${FAIL_ON.join(', ')}`);
  const maxes = parseMax(flags.max);

  const text = readInput(file);
  let report;
  try {
    report = analyze(text, {
      path: file === '-' ? undefined : file.split('\\').join('/'),
      plain: flags.plain,
      historical: flags.historical,
      only: list(flags.only),
      ignore: list(flags.ignore),
      include: list(flags.include),
      command,
    });
  } catch (e) {
    throw new UsageError(e.message);
  }

  const output = isRender ? render(report, text, { title: flags.title, caption: flags.caption }) : format(report, kind);
  if (flags.out) {
    writeOut(flags.out, output);
    console.error(`wrote ${flags.out}`);
  } else {
    console.log(output);
  }

  const reasons = gates(report, flags['fail-on'], maxes);
  for (const r of reasons) console.error(`tells: ${r}`);
  return process.exit(reasons.length ? 1 : 0);
}

try {
  main(process.argv.slice(2));
} catch (e) {
  if (e instanceof UsageError) {
    console.error(`tells: ${e.message}\n\nRun tells --help for usage.`);
    process.exit(2);
  }
  console.error(`tells: ${e.message}`);
  process.exit(1);
}
