/**
 * report.mjs: what Tells says about a document, and the four things it
 * refuses to say.
 *
 * 1. IT DOES NOT RETURN AN "AI PROBABILITY". There is no total, no score and
 *    no verdict anywhere in this object, and there will not be one. Every
 *    rule reports its own count against its own baseline, where a baseline
 *    has been published. A composite number would be exactly the uncheckable
 *    figure this tool exists to argue against, and the rules are not
 *    independent (one word can be counted by three of them), so a sum would
 *    not even be arithmetic. `REPORT_SHAPE` and `reportKeyProblems` exist so
 *    a test and the audit can both prove no such key has crept in: the shape
 *    is a whitelist, and any key it does not name fails the audit.
 *
 * 2. IT CANNOT DETERMINE AUTHORSHIP. A person can write every pattern here
 *    and a model can write none of them. Seven commercial detectors flagged
 *    an average of 61% of essays by non-native English writers as
 *    machine-written (Liang et al., Patterns, 2023, arXiv:2304.02819)
 *    because they keyed on a surface feature. Tells reports surface features
 *    and says that is what they are.
 *
 * 3. IT DOES NOT REWRITE. It points. What happens next is the writer's call.
 *
 * 4. IT DOES NOT MAKE TEXT UNDETECTABLE and does not try to.
 *
 * Those four statements are the `limits` block. It is part of the schema,
 * every formatter prints it, and the audit fails a report where it is
 * missing or edited.
 */

import { parseDocument, per1k } from './document.mjs';
import { describe } from './stats.mjs';
import { sha256 } from './sha256.mjs';
import { selectRules, RULE_IDS } from './rules/index.mjs';

export const SCHEMA = 'tells/report@1';
export const VERSION = '0.1.0';

export const LIMITS = Object.freeze([
  'Tells cannot determine authorship.',
  'No single rule is evidence on its own; the guide this draws on says the same.',
  'Seven detectors flagged an average of 61% of TOEFL essays by non-native English writers as machine-written (Liang et al. 2023); surface features are not origin.',
  'This report does not make text undetectable and does not try to.',
]);

export const LIMITS_SOURCE = Object.freeze({
  label: 'Liang et al., GPT detectors are biased against non-native English writers, Patterns, 2023, arXiv:2304.02819',
  url: 'https://arxiv.org/abs/2304.02819',
});

/**
 * Tokens a report key may never contain.
 *
 * WHY TOKENS AND NOT A SUBSTRING. The first version of this check was
 * /score|probab|verdict|likelihood|confidence/i applied to the raw key. The
 * vocabulary rule's `detail.words` map is keyed by the word it matched, and
 * "underscore" is item 31 on the project's own word list, so an honest report
 * on a document containing "underscore" accused itself of forgery and exited
 * 1. A key is now split on non-letters and on camelCase boundaries and each
 * token is matched whole: `aiScore` and `ai_probability` are still caught,
 * `underscore` and `scorecard` are not.
 */
const FORBIDDEN_TOKENS = new Set([
  'score', 'scores', 'scored', 'scoring', 'verdict', 'verdicts', 'likelihood', 'likelihoods',
  'confidence', 'confident', 'probability', 'probabilities', 'probable', 'probabilistic', 'prob',
  'rating', 'ratings', 'rated', 'assessment', 'assessments', 'assessed', 'risk', 'risks',
  'authorship', 'ai', 'human', 'humans', 'generated', 'detection', 'detections', 'detected',
  'detector', 'guilt', 'guilty', 'flagged', 'suspicion', 'suspicious',
]);

/** Split a key into words: non-letters and camelCase boundaries are the cuts. */
export function tokeniseKey(key) {
  return String(key).split(/[^A-Za-z]+|(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/).filter(Boolean);
}

export const isForbiddenKey = (key) => tokeniseKey(key).some((t) => FORBIDDEN_TOKENS.has(t.toLowerCase()));

/** Below this many words one finding moves a per-1,000 rate by more than 3. */
export const MIN_WORDS_FOR_RATES = 300;

/**
 * The shape of tells/report@1, as a whitelist. Every key a report may carry is
 * named here; the audit fails any key that is not.
 *
 * LEAF means "a value, do not descend". DATA means "a rule's own figures,
 * whose keys come from the document" (the vocabulary word map is keyed by the
 * matched word). DATA subtrees are never key-checked, because a document is
 * allowed to contain the words "underscore", "scorecard", "probability" and
 * "confidence interval", and a report about it is allowed to say so.
 */
const LEAF = null;
const DATA = 'data';
const POSITION = { words: LEAF, line: LEAF, col: LEAF };
const PUBLISHED_RATE = { per1k: LEAF, label: LEAF };

export const REPORT_SHAPE = Object.freeze({
  schema: LEAF,
  tool: { name: LEAF, version: LEAF },
  document: { path: LEAF, sha256: LEAF, bytesSha256: LEAF, words: LEAF, sentences: LEAF, paragraphs: LEAF, lines: LEAF, chars: LEAF },
  observedAt: LEAF,
  options: { plain: LEAF, historical: LEAF, only: LEAF, ignore: LEAF, include: LEAF },
  partialRun: { ran: LEAF, of: LEAF, skipped: LEAF },
  rules: [{
    id: LEAF, name: LEAF, category: LEAF, weight: LEAF, count: LEAF, per1k: LEAF,
    baseline: { ...PUBLISHED_RATE, alt: [PUBLISHED_RATE], machine: [PUBLISHED_RATE] },
    aboveBaseline: LEAF,
    findings: [{ line: LEAF, col: LEAF, offset: LEAF, length: LEAF, match: LEAF, excerpt: LEAF, note: LEAF, aggregate: LEAF, weight: LEAF }],
    detail: DATA,
  }],
  stats: {
    label: LEAF,
    sentenceLength: { mean: LEAF, sd: LEAF, n: LEAF, unit: LEAF },
    paragraphLength: { mean: LEAF, sd: LEAF, n: LEAF, unit: LEAF },
    typeTokenRatio: { value: LEAF, types: LEAF, tokens: LEAF, window: LEAF, note: LEAF },
    repeatedOpeners: { count: LEAF, of: LEAF, share: LEAF },
    longestSentence: POSITION,
    shortestSentence: POSITION,
    punctuation: { emDashes: LEAF, enDashes: LEAF, semicolons: LEAF, colons: LEAF, questions: LEAF },
    structure: { headings: LEAF, listItems: LEAF, boldSpans: LEAF },
  },
  totals: { findings: LEAF, distinctSpans: LEAF, byWeight: { weak: LEAF, moderate: LEAF, strong: LEAF }, rulesTriggered: LEAF },
  rates: { reliable: LEAF, minWords: LEAF, note: LEAF },
  limits: LEAF,
  limitsSource: { label: LEAF, url: LEAF },
  command: LEAF,
  redaction: { fields: LEAF, reason: LEAF, when: LEAF, kept: LEAF },
});

/**
 * Dotted paths of every forbidden key in an arbitrary object. No schema: this
 * walks everything, so it also serves data files that are not reports.
 *
 * @returns {string[]}
 */
export function findForbiddenKeys(value, path = '') {
  if (value === null || typeof value !== 'object') return [];
  const out = [];
  for (const [k, v] of Object.entries(value)) {
    const here = Array.isArray(value) ? `${path}[${k}]` : path ? `${path}.${k}` : k;
    if (!Array.isArray(value) && isForbiddenKey(k)) out.push(here);
    out.push(...findForbiddenKeys(v, here));
  }
  return out;
}

/**
 * Every key problem in a report, walked against REPORT_SHAPE.
 *
 * Two kinds, and the second is the one that closes the class: a key does not
 * have to read like a verdict to be one. "aiRating", "assessment",
 * "riskLevel" and "authorship" are all keys no version of this schema
 * defines, so they fail whether or not anyone thought to ban the word.
 *
 * @returns {{path: string, why: string}[]}
 */
export function reportKeyProblems(value, shape = REPORT_SHAPE, path = '') {
  if (shape === DATA || value === null || typeof value !== 'object') return [];
  const out = [];
  if (Array.isArray(shape)) {
    if (Array.isArray(value)) value.forEach((v, i) => out.push(...reportKeyProblems(v, shape[0], `${path}[${i}]`)));
    return out;
  }
  if (Array.isArray(value) || shape === LEAF) return [];
  for (const [k, v] of Object.entries(value)) {
    const here = path ? `${path}.${k}` : k;
    if (isForbiddenKey(k)) out.push({ path: here, why: 'a report carries counts, never a score, a rating or a probability' });
    else if (!(k in shape)) out.push({ path: here, why: `no key named "${k}" exists in ${SCHEMA}` });
    else out.push(...reportKeyProblems(v, shape[k], here));
  }
  return out;
}

export const effectiveWeight = (rule, finding) => finding.weight ?? rule.weight;

/**
 * Is a rate comparable with a published baseline at all?
 *
 * Below MIN_WORDS_FOR_RATES one finding moves a per-1,000 rate by more than
 * 3, which is most of the only baseline this project can cite. Printing
 * "above 3.23" for a 112-word README and disclaiming it on the next line is
 * two claims where one will be read, so the comparison is not made: the
 * report says aboveBaseline is null and the tables say "too short to rate".
 */
export const ratesComparable = (words) => words >= MIN_WORDS_FOR_RATES;

/** Run the selected rules over a parsed document. Shared by analyze and audit. */
export function runRules(doc, options) {
  const comparable = ratesComparable(doc.counts.words);
  return selectRules(options).map((rule) => {
    const findings = rule.detect(doc);
    const count = findings.filter((f) => !f.aggregate).length;
    const rate = per1k(count, doc.counts.words);
    const entry = {
      id: rule.id,
      name: rule.name,
      category: rule.category,
      weight: rule.weight,
      count,
      per1k: rate,
      baseline: rule.baseline,
      aboveBaseline: rule.baseline && comparable ? rate > rule.baseline.per1k : null,
      findings,
    };
    if (rule.detail) entry.detail = rule.detail(doc, findings);
    return entry;
  });
}

const spanKey = (f) => `${f.line}:${f.col}:${f.length}`;

export function totalsOf(rules) {
  const byWeight = { weak: 0, moderate: 0, strong: 0 };
  const spans = new Set();
  let findings = 0;
  for (const r of rules) {
    for (const f of r.findings) {
      findings++;
      spans.add(spanKey(f));
      byWeight[effectiveWeight(r, f)]++;
    }
  }
  // Rules overlap on purpose: "Additionally" is both a vocabulary word and a
  // transition opener. Two rules counting one word is two findings over one
  // span, and a reader is owed both numbers rather than the larger one.
  return { findings, distinctSpans: spans.size, byWeight, rulesTriggered: rules.filter((r) => r.findings.length > 0).length };
}

/** Which rules did not run, when the caller narrowed the set by hand. */
export function partialRunOf(rules, options) {
  if (!options.only.length && !options.ignore.length) return null;
  const ran = new Set(rules.map((r) => r.id));
  return { ran: ran.size, of: RULE_IDS.length, skipped: RULE_IDS.filter((id) => !ran.has(id)) };
}

export function ratesOf(words) {
  return {
    reliable: ratesComparable(words),
    minWords: MIN_WORDS_FOR_RATES,
    note: ratesComparable(words)
      ? 'per-1,000-word rates are computed over the whole document'
      : `document has ${words} words; below ${MIN_WORDS_FOR_RATES} a single finding moves a per-1,000 rate by more than 3, so compare counts, not rates`,
  };
}

export function normaliseOptions({ plain = false, historical = false, only = [], ignore = [], include = [] } = {}) {
  return { plain: !!plain, historical: !!historical, only: [...only], ignore: [...ignore], include: [...include] };
}

/**
 * Analyse a document.
 *
 * @param {string} input                the document text
 * @param {object} [opts]
 * @param {string}   [opts.path]        shown in findings; never read from disk here
 * @param {boolean}  [opts.plain]       turn Markdown-aware masking off
 * @param {boolean}  [opts.historical]  include rules kept for older text
 * @param {string[]} [opts.only]        run only these rule ids
 * @param {string[]} [opts.ignore]      skip these rule ids
 * @param {string[]} [opts.include]     add these off-by-default rules
 * @param {string}   [opts.command]     the command that reproduces this report
 * @param {string}   [opts.observedAt]  ISO timestamp; defaults to now
 */
export function analyze(input, opts = {}) {
  const options = normaliseOptions(opts);
  const doc = parseDocument(input, { plain: options.plain });
  const rules = runRules(doc, options);
  const { words, sentences, paragraphs, lines, chars } = doc.counts;

  // Two hashes, and they answer different questions. `sha256` is taken after
  // line endings are normalised, so the same prose hashes the same on a CRLF
  // checkout; it is the identity the audit uses. `bytesSha256` is the file as
  // it sits on disk, which is what `sha256sum` and a SARIF consumer compute.
  const document = {
    sha256: sha256(doc.raw),
    bytesSha256: sha256(input),
    words, sentences, paragraphs, lines, chars,
  };

  return {
    schema: SCHEMA,
    tool: { name: 'tells', version: VERSION },
    document: opts.path ? { path: opts.path, ...document } : document,
    observedAt: opts.observedAt ?? new Date().toISOString(),
    options,
    partialRun: partialRunOf(rules, options),
    rules,
    stats: describe(doc),
    totals: totalsOf(rules),
    rates: ratesOf(words),
    limits: [...LIMITS],
    limitsSource: { ...LIMITS_SOURCE },
    command: opts.command ?? 'tells (api)',
  };
}
