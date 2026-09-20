/**
 * corpus.mjs: turn a set of reports into the rates table. Pure.
 *
 * The corpus is this project's variable-change evidence: the same rules over
 * texts whose origin is known. This module is careful about what that does
 * and does not show.
 *
 *   - Rows are files. Columns are rules. Cells are findings per 1,000 words.
 *     The last column counts strong findings, which are chat debris.
 *   - There is no "accuracy" anywhere, because nothing here classifies. A
 *     rate describes one file.
 *   - The machine samples were written by the same model family that wrote
 *     the rules. CAVEAT below says so, and it is attached to every table this
 *     module prints, not left to a README.
 *   - The evasion comparison is recorded whichever way it comes out.
 *
 * File access lives in src/node/corpus.mjs. This file takes strings.
 */

import { analyze, effectiveWeight, VERSION } from './report.mjs';
import { parseDocument } from './document.mjs';

export const CORPUS_SCHEMA = 'tells/corpus@1';

export const CAVEAT =
  'The machine samples were written by the same model family that built the linter; rates in this table describe these files and are not an accuracy claim about any detector, including this one.';

/** Column headings short enough for a twelve-row table to fit a page. */
export const SHORT = {
  vocabulary: 'voc', 'copula-avoidance': 'cop', 'negative-parallelism': 'neg', 'rule-of-three': 'r3', 'em-dash': 'dash',
  'ing-analysis': 'ing', 'significance-inflation': 'sig', puffery: 'puf', 'vague-attribution': 'attr',
  'vague-association': 'assoc', 'transition-openers': 'trans', 'challenges-formula': 'chal',
  'inline-header-lists': 'ihl', 'bold-overuse': 'bold', 'heading-style': 'head', 'chat-residue': 'chat',
  'model-artifacts': 'art', 'didactic-disclaimers': 'didac',
};

export const EVASION_RULES = ['vocabulary', 'negative-parallelism'];

/** How much of a hybrid file's findings fall inside the inserted machine lines. */
function localisation(report, text, [from, to]) {
  const doc = parseDocument(text, { plain: report.options.plain });
  const inside = (line) => line >= from && line <= to;
  let findingsInside = 0;
  let findingsTotal = 0;
  for (const r of report.rules) {
    for (const f of r.findings) {
      if (f.aggregate) continue;
      findingsTotal++;
      if (inside(f.line)) findingsInside++;
    }
  }
  const wordsInside = doc.words.filter((w) => inside(doc.locate(w.start).line)).length;
  const share = (a, b) => (b ? Math.round((a / b) * 1000) / 1000 : null);
  return {
    machineLines: [from, to],
    findingsInside,
    findingsTotal,
    wordsInside,
    wordsTotal: doc.counts.words,
    shareOfFindings: share(findingsInside, findingsTotal),
    shareOfWords: share(wordsInside, doc.counts.words),
    method: 'non-aggregate findings whose line falls inside the inserted range, against the share of words on those lines',
  };
}

/**
 * @param {object} manifest              parsed corpus/MANIFEST.json
 * @param {(path: string) => string} read  returns the text of a corpus file
 * @param {object} [opts]
 * @param {string} [opts.observedAt]     date stamp for the run (YYYY-MM-DD)
 * @param {string} [opts.command]
 */
export function runCorpus(manifest, read, { observedAt, command = 'tells corpus' } = {}) {
  const files = manifest.files.map((entry) => {
    const text = read(entry.path);
    // Every rule, including the ones that are off by default, because the
    // table is the evidence for which rules separate anything. A rule that is
    // off by default is off because of what this table says about it, so the
    // table cannot be the one place it does not appear.
    const report = analyze(text, { path: entry.path, plain: !!entry.plain, historical: true, observedAt: `${observedAt ?? '1970-01-01'}T00:00:00.000Z` });
    const rates = {};
    for (const r of report.rules) rates[r.id] = { count: r.count, per1k: r.per1k };
    const strong = report.rules.reduce((n, r) => n + r.findings.filter((f) => effectiveWeight(r, f) === 'strong').length, 0);
    const row = { id: entry.id, path: entry.path, kind: entry.kind, plain: !!entry.plain, words: report.document.words, sha256: report.document.sha256, rates, strong };
    if (entry.kind === 'hybrid' && entry.machineLines) row.localisation = localisation(report, text, entry.machineLines);
    return row;
  });

  const pair = manifest.evasion;
  let evasion = null;
  if (pair) {
    const plain = files.find((f) => f.id === pair.plain);
    const evaded = files.find((f) => f.id === pair.evasion);
    if (!plain || !evaded) throw new Error(`corpus: evasion pair names ${pair.plain} and ${pair.evasion}, and at least one is not in the manifest`);
    evasion = { plain: plain.id, evasion: evaded.id, rules: {} };
    for (const id of EVASION_RULES) {
      evasion.rules[id] = {
        plain: plain.rates[id],
        evasion: evaded.rates[id],
        evasionLower: evaded.rates[id].per1k < plain.rates[id].per1k,
      };
    }
    // Every rule, so the rules the evasion sample did NOT escape are visible too.
    evasion.allRules = Object.fromEntries(
      Object.keys(plain.rates).map((id) => [id, { plain: plain.rates[id].per1k, evasion: evaded.rates[id].per1k }]),
    );
  }

  return {
    schema: CORPUS_SCHEMA,
    observedAt: observedAt ?? null,
    tool: { name: 'tells', version: VERSION },
    ruleIds: Object.keys(files[0]?.rates ?? {}),
    files,
    evasion,
    caveat: CAVEAT,
    command,
  };
}

/** The rates table, as Markdown that also reads in a terminal. */
export function corpusTable(results) {
  const ids = results.ruleIds;
  const head = ['file', 'kind', 'words', ...ids.map((id) => SHORT[id] ?? id), 'strong'];
  const lines = [`| ${head.join(' | ')} |`, `|${head.map((h, i) => (i < 2 ? '---' : '---:')).join('|')}|`];
  for (const f of results.files) {
    lines.push(`| ${[f.id, f.kind, f.words, ...ids.map((id) => f.rates[id].per1k.toFixed(1)), f.strong].join(' | ')} |`);
  }
  return lines.join('\n');
}

export function corpusLegend(results) {
  return `Cells are findings per 1,000 words. "strong" is a count of chat-debris findings. Columns: ${results.ruleIds.map((id) => `${SHORT[id] ?? id} = ${id}`).join(', ')}.`;
}

/** The evasion comparison in words, stated whichever way it came out. */
export function evasionSummary(results) {
  const e = results.evasion;
  if (!e) return null;
  const parts = EVASION_RULES.map((id) => {
    const r = e.rules[id];
    return `${id}: ${r.plain.per1k} per 1k (${r.plain.count}) in ${e.plain}, ${r.evasion.per1k} per 1k (${r.evasion.count}) in ${e.evasion}, ${r.evasionLower ? 'lower' : 'NOT lower'}`;
  });
  const still = Object.entries(e.allRules).filter(([, v]) => v.evasion > 0 && v.evasion >= v.plain).map(([id]) => id);
  return `Evasion sample against the plain sample. ${parts.join('. ')}. Rules where the evasion sample is level or higher: ${still.length ? still.join(', ') : 'none'}.`;
}

export function formatCorpus(results) {
  const out = [corpusTable(results), '', corpusLegend(results)];
  const ev = evasionSummary(results);
  if (ev) out.push('', ev);
  for (const f of results.files.filter((x) => x.localisation)) {
    const l = f.localisation;
    out.push('', `${f.id}: lines ${l.machineLines[0]}-${l.machineLines[1]} are the inserted machine paragraph. They hold ${l.wordsInside} of ${l.wordsTotal} words (${(l.shareOfWords * 100).toFixed(1)}%) and ${l.findingsInside} of ${l.findingsTotal} findings${l.shareOfFindings === null ? '' : ` (${(l.shareOfFindings * 100).toFixed(1)}%)`}.`);
  }
  out.push('', results.caveat, '', `observed ${results.observedAt}; reproduce: ${results.command}`);
  return out.join('\n');
}
