/**
 * tells: a linter for prose that reads as machine-written.
 *
 * It returns the passages that match known signs of LLM-generated text, each
 * with a rule, a line, a column and a count. It does not produce a
 * probability, cannot determine authorship, and does not rewrite anything.
 *
 * Everything exported here is pure and imports no node: builtin, so the same
 * files run in a browser. File and network access live in src/node/.
 *
 *   import { analyze, formatText } from 'tells';
 *   const report = analyze(markdownString, { path: 'draft.md' });
 *   console.log(formatText(report));
 */

export {
  analyze, LIMITS, LIMITS_SOURCE, SCHEMA, VERSION, MIN_WORDS_FOR_RATES,
  REPORT_SHAPE, tokeniseKey, isForbiddenKey, findForbiddenKeys, reportKeyProblems,
} from './report.mjs';
export { parseDocument, per1k, ABBREVIATIONS } from './document.mjs';
export { describe, STATS_LABEL, TTR_WINDOW } from './stats.mjs';
export { RULES, RULE_IDS, CATEGORIES, WEIGHTS, getRule, selectRules } from './rules/index.mjs';
export { SOURCES, VOCABULARY, ERAS } from './rules/lexicon.mjs';
export { sha256 } from './sha256.mjs';
export { format, formatText, formatJson, formatMarkdown, formatSarif, formatRules, baselineText, FORMATS } from './format.mjs';
export { audit, formatAudit } from './audit.mjs';
export { render } from './render.mjs';
export { redact } from './redact.mjs';
