/**
 * format.mjs: four ways to print a report, and one promise across all four.
 *
 * THE PROMISE: the limits block is in every format, in a place that format's
 * reader will actually see. In text and Markdown it is printed after the
 * table. In JSON it is the `limits` key. In SARIF it goes into three places:
 * every rule's `fullDescription` and `help.text`, `runs[0].properties`, and
 * `invocations[0].toolExecutionNotifications`. The notifications alone were
 * not enough: GitHub code scanning renders results, `fullDescription` and
 * `help`, and does not render `toolExecutionNotifications`, so the one
 * consumer the README recommends was the one consumer that never saw the
 * limits. A reader who only ever sees one format still sees that Tells cannot
 * determine authorship, and sees the 61% figure with its source.
 *
 * THE SECOND PROMISE: a report that did not run every rule says so first. A
 * run narrowed by --only or --ignore prints "partial run: N of M rules; rules
 * skipped: ..." in every format, because "No findings." over a hidden
 * --ignore list is the cheapest lie this tool could tell.
 *
 * Nothing here computes. Formatters read the report and lay it out; if a
 * number is not in the report, it is not printed.
 *
 *   text   findings grouped by rule as `path:line:col  rule  match  | excerpt`,
 *          then the per-rule table, statistics, limits, reproduce command
 *   json   the report, pretty-printed
 *   md     the same content as Markdown tables, for pasting into a pull request
 *   sarif  SARIF 2.1.0 for code-scanning tools
 */

import { RULES } from './rules/index.mjs';
import { effectiveWeight, LIMITS, LIMITS_SOURCE } from './report.mjs';

export const FORMATS = ['text', 'json', 'md', 'sarif'];

const oneLine = (s, max) => {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat;
};

const where = (report) => report.document.path ?? '<stdin>';

export function baselineText(entry) {
  const b = entry.baseline;
  if (!b) return 'none published';
  const others = [...(b.alt ?? []), ...(b.machine ?? [])].map((x) => `${x.per1k} ${x.label}`).join('; ');
  const tail = `${b.per1k} ${b.label}${others ? `. Also published: ${others}` : ''}`;
  // aboveBaseline is null on a document too short for a rate to mean anything.
  // Saying "above 3.23" and disclaiming it two lines later is two claims, and
  // only the first one gets read.
  if (entry.aboveBaseline === null) return `too short to rate against ${tail}`;
  return `${entry.aboveBaseline ? 'above' : 'at or below'} ${tail}`;
}

/** "partial run: 3 of 18 rules; rules skipped: ..." or null. */
export function partialRunText(report) {
  const p = report.partialRun;
  if (!p) return null;
  return `partial run: ${p.ran} of ${p.of} rules; rules skipped: ${p.skipped.join(', ')}`;
}

/** How many findings one rule prints before the text format gives up. */
export const TEXT_FINDING_CAP = 50;

/**
 * The bracket after a match. An aggregate spans a run of other findings and
 * is not added to the count, so it can sit at the same line:col as the first
 * finding inside it; saying so is the only thing that tells the two apart.
 */
function tagOf(f) {
  const note = f.note && f.note.toLowerCase() !== String(f.match).toLowerCase() ? f.note : '';
  if (!f.aggregate) return note ? `  [${note}]` : '';
  return `  [aggregate, not counted${note ? `: ${note}` : ''}]`;
}

/**
 * The tally line. It says distinct spans as well as findings, because rules
 * overlap on purpose: "Additionally" is a vocabulary word and a transition
 * opener, and counting one word twice and calling the sum three findings
 * lands hardest on exactly the writer this tool is meant to defend.
 */
export function totalsText(t) {
  const spans = t.distinctSpans ?? t.findings;
  const over = spans === t.findings ? '' : ` covering ${spans} distinct span${spans === 1 ? '' : 's'}`;
  return `${t.findings} finding${t.findings === 1 ? '' : 's'}${over} in ${t.rulesTriggered} rule${t.rulesTriggered === 1 ? '' : 's'} (weak ${t.byWeight.weak}, moderate ${t.byWeight.moderate}, strong ${t.byWeight.strong}). Rules overlap, so this is a tally of findings, not a measure of anything.`;
}

/** The flags this report was produced with, as they would be typed. */
export function optionsText(report) {
  const o = report.options ?? {};
  const list = (v) => (v && v.length ? v.join(',') : '-');
  return `plain=${!!o.plain} historical=${!!o.historical} only=${list(o.only)} ignore=${list(o.ignore)} include=${list(o.include)}`;
}

function statsLines(stats) {
  const s = stats;
  const pos = (p) => (p ? `${p.words} words at ${p.line}:${p.col}` : 'n/a');
  return [
    `sentence length     mean ${s.sentenceLength.mean ?? 'n/a'}, sd ${s.sentenceLength.sd ?? 'n/a'} words (n=${s.sentenceLength.n})`,
    `paragraph length    mean ${s.paragraphLength.mean ?? 'n/a'}, sd ${s.paragraphLength.sd ?? 'n/a'} sentences (n=${s.paragraphLength.n})`,
    `type-token ratio    ${s.typeTokenRatio.value ?? 'n/a'} (${s.typeTokenRatio.types} types in ${s.typeTokenRatio.tokens} tokens; ${s.typeTokenRatio.note})`,
    `repeated openers    ${s.repeatedOpeners.count} of ${s.repeatedOpeners.of} sentences start with the same word as the one before`,
    `longest sentence    ${pos(s.longestSentence)}`,
    `shortest sentence   ${pos(s.shortestSentence)}`,
  ];
}

function limitsLines(report) {
  return [...report.limits, `Source: ${report.limitsSource.label}. ${report.limitsSource.url}`];
}

/* ---------------- text ---------------- */

export function formatText(report) {
  const d = report.document;
  const path = where(report);
  const out = [];
  out.push(`tells ${report.tool.version}  ${path}`);
  out.push(`${d.words} words, ${d.sentences} sentences, ${d.paragraphs} paragraphs, ${d.lines} lines  sha256 ${d.sha256.slice(0, 12)}`);
  out.push('Counts and locations. Not a verdict: Tells cannot determine authorship.');
  out.push(`options: ${optionsText(report)}`);
  const partial = partialRunText(report);
  if (partial) out.push(partial);

  const fired = report.rules.filter((r) => r.findings.length);
  if (!fired.length) out.push('', 'No findings.');
  for (const r of fired) {
    out.push('', `${r.id}  (${r.weight})  ${r.count} counted, ${r.per1k} per 1k words`);
    for (const f of r.findings.slice(0, TEXT_FINDING_CAP)) {
      out.push(`  ${path}:${f.line}:${f.col}  ${r.id}  ${oneLine(f.match, 60)}${tagOf(f)}  | ${f.excerpt}`);
    }
    if (r.findings.length > TEXT_FINDING_CAP) {
      out.push(`  ... ${r.findings.length - TEXT_FINDING_CAP} more not printed. Use --format json for all of them.`);
    }
  }

  out.push('', 'Per rule');
  const idWidth = Math.max(...report.rules.map((r) => r.id.length), 4);
  out.push(`  ${'rule'.padEnd(idWidth)}  ${'weight'.padEnd(8)}  ${'count'.padStart(5)}  ${'per 1k'.padStart(7)}  baseline`);
  for (const r of report.rules) {
    out.push(`  ${r.id.padEnd(idWidth)}  ${r.weight.padEnd(8)}  ${String(r.count).padStart(5)}  ${r.per1k.toFixed(2).padStart(7)}  ${baselineText(r)}`);
  }
  out.push(`  ${totalsText(report.totals)}`);
  if (!report.rates.reliable) out.push(`  Note: ${report.rates.note}.`);

  out.push('', `Statistics (${report.stats.label})`);
  for (const l of statsLines(report.stats)) out.push(`  ${l}`);

  out.push('', 'Limits');
  for (const l of limitsLines(report)) out.push(`  ${l}`);

  out.push('', `reproduce: ${report.command}`);
  return out.join('\n');
}

/* ---------------- json ---------------- */

export function formatJson(report) {
  return JSON.stringify(report, null, 2);
}

/* ---------------- markdown ---------------- */

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

export function formatMarkdown(report) {
  const d = report.document;
  const path = where(report);
  const out = [];
  out.push(`### tells: ${cell(path)}`, '');
  out.push(`${d.words} words, ${d.sentences} sentences, ${d.paragraphs} paragraphs. Counts and locations, not a verdict.`, '');
  out.push(`\`options: ${optionsText(report)}\``, '');
  const partial = partialRunText(report);
  if (partial) out.push(`**${partial}**`, '');
  out.push('| rule | weight | count | per 1k | baseline |', '|---|---|---:|---:|---|');
  for (const r of report.rules) {
    out.push(`| ${r.id} | ${r.weight} | ${r.count} | ${r.per1k.toFixed(2)} | ${cell(baselineText(r))} |`);
  }
  out.push(`| | | **${report.totals.findings}** | | ${cell(totalsText(report.totals))} |`);
  if (!report.rates.reliable) out.push('', `Note: ${report.rates.note}.`);

  const fired = report.rules.filter((r) => r.findings.length);
  if (fired.length) {
    out.push('', '| location | rule | match | note |', '|---|---|---|---|');
    for (const r of fired) {
      for (const f of r.findings) {
        const note = `${f.aggregate ? 'aggregate, not counted' : ''}${f.aggregate && f.note ? ': ' : ''}${f.note ?? ''}`;
        out.push(`| ${cell(path)}:${f.line}:${f.col} | ${r.id} | ${cell(oneLine(f.match, 60))} | ${cell(note)} |`);
      }
    }
  } else {
    out.push('', 'No findings.');
  }

  out.push('', `Statistics (${report.stats.label}):`, '');
  for (const l of statsLines(report.stats)) out.push(`- ${l.replace(/\s{2,}/, ': ')}`);

  out.push('', '**Limits**', '');
  for (const l of limitsLines(report)) out.push(`- ${l}`);
  out.push('', `Reproduce: \`${report.command}\``);
  return out.join('\n');
}

/* ---------------- sarif ---------------- */

const SARIF_LEVEL = { weak: 'note', moderate: 'warning', strong: 'warning' };

function region(f) {
  const lines = f.match.split('\n');
  const last = lines[lines.length - 1];
  return {
    startLine: f.line,
    startColumn: f.col,
    endLine: f.line + lines.length - 1,
    endColumn: lines.length === 1 ? f.col + f.length : last.length + 1,
    snippet: { text: f.match },
  };
}

export function formatSarif(report) {
  const ran = report.rules.map((r) => RULES.find((x) => x.id === r.id)).filter(Boolean);
  const uri = (report.document.path ?? 'stdin').replace(/\\/g, '/');
  const limits = limitsLines(report);
  // GitHub code scanning renders fullDescription and help, and does not
  // render toolExecutionNotifications. So the limits ride on every rule.
  const limitsText = `LIMITS: ${limits.join(' ')}`;
  const partial = partialRunText(report);

  const results = [];
  report.rules.forEach((r, ruleIndex) => {
    for (const f of r.findings) {
      results.push({
        ruleId: r.id,
        ruleIndex,
        level: SARIF_LEVEL[effectiveWeight(r, f)],
        message: { text: `${r.name}: "${oneLine(f.match, 80)}"${f.note ? ` (${f.note})` : ''}. A count, not a verdict.` },
        locations: [{ physicalLocation: { artifactLocation: { uri }, region: region(f) } }],
        properties: { weight: effectiveWeight(r, f), aggregate: !!f.aggregate },
      });
    }
  });

  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: report.tool.name,
            version: report.tool.version,
            informationUri: 'https://github.com/CandyFlex/tells',
            rules: ran.map((rule) => ({
              id: rule.id,
              name: rule.name,
              shortDescription: { text: rule.name },
              fullDescription: { text: `${rule.description} ${limitsText}` },
              helpUri: rule.source[0].url,
              help: { text: `${rule.description} Sources: ${rule.source.map((s) => `${s.label} ${s.url}`).join('; ')} ${limitsText}` },
              defaultConfiguration: { level: SARIF_LEVEL[rule.weight] },
              properties: { category: rule.category, weight: rule.weight },
            })),
          },
        },
        columnKind: 'utf16CodeUnits',
        properties: {
          limits,
          limitsSource: report.limitsSource,
          options: report.options,
          partialRun: report.partialRun ?? null,
        },
        invocations: [
          {
            executionSuccessful: true,
            commandLine: report.command,
            endTimeUtc: report.observedAt,
            toolExecutionNotifications: [...limits, ...(partial ? [partial] : [])].map((text) => ({
              level: 'note',
              descriptor: { id: 'limits' },
              message: { text },
            })),
          },
        ],
        // The hash is of the file's bytes, so `sha256sum` reproduces it. The
        // hash the report is identified by is taken after line endings are
        // normalised, which no consumer can recompute from the file; it is
        // kept beside it under a name that says what it is.
        artifacts: [{
          location: { uri },
          hashes: { 'sha-256': report.document.bytesSha256 ?? report.document.sha256 },
          properties: { normalisedSha256: report.document.sha256 },
        }],
        results,
      },
    ],
  };
  return JSON.stringify(sarif, null, 2);
}

/* ---------------- rule listing ---------------- */

/**
 * The rule catalogue. This is the output most likely to be screenshotted into
 * an argument about somebody's writing, so it carries the limits first, the
 * same four lines every report carries.
 */
export function formatRules(rules = RULES) {
  const out = ['Limits'];
  for (const l of [...LIMITS, `Source: ${LIMITS_SOURCE.label}. ${LIMITS_SOURCE.url}`]) out.push(`  ${l}`);
  out.push('', 'Rules. Weight says how much ONE finding means alone: weak (only the density means anything), moderate (a handful is a pattern), strong (chat debris; read it).', '');
  for (const r of rules) {
    out.push(`${r.id}  [${r.category}, ${r.weight}${r.historical ? `, off by default: --include ${r.id}` : ''}]`);
    out.push(`  ${r.description}`);
    out.push(`  baseline: ${r.baseline ? `${r.baseline.per1k} per 1k, ${r.baseline.label}${[...(r.baseline.alt ?? []), ...(r.baseline.machine ?? [])].map((x) => `; ${x.per1k} ${x.label}`).join('')}` : 'none published'}`);
    for (const s of r.source) out.push(`  source: ${s.label}  ${s.url}`);
    out.push('');
  }
  return out.join('\n').trimEnd();
}

export function format(report, kind = 'text') {
  switch (kind) {
    case 'text': return formatText(report);
    case 'json': return formatJson(report);
    case 'md': return formatMarkdown(report);
    case 'sarif': return formatSarif(report);
    default: throw new Error(`unknown format "${kind}". Use one of: ${FORMATS.join(', ')}`);
  }
}
