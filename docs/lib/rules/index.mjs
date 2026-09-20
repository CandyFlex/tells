/**
 * rules/index.mjs: the registry.
 *
 * One module per rule. Each is a pure function over a parsed document that
 * returns findings with a location and the literal matched text. No rule
 * calls a model, reads another rule's output, or produces a judgement about
 * who wrote anything.
 *
 * The contract every rule module meets (test/rules.test.mjs enforces it):
 *
 *   id           kebab-case, stable; it is the key users put in --only
 *   name         short human label
 *   category     vocabulary | structure | punctuation | attribution | formatting | artifact
 *   weight       weak | moderate | strong: how much ONE finding means alone
 *   description  one plain paragraph that says what a false positive looks like
 *   source       [{ label, url }], never empty
 *   baseline     { per1k, label, alt, machine } or null. Null means nobody has
 *                published a rate this project could cite, so none is claimed.
 *   historical   true = off unless asked for
 *   detect(doc)  -> findings in document order
 *   detail(doc, findings)  optional, -> extra per-rule figures
 *
 * WEIGHTS, stated once. weak: common in careful human writing; only the
 * density means anything. moderate: a recognisable habit; a handful in a
 * short document is a pattern. strong: not a style at all but debris from a
 * chat interface; one hit deserves to be read. Only the two artifact rules
 * are strong.
 *
 * The same words can be counted by more than one rule ("boasts" is on the
 * vocabulary list, is a copula substitute, and is puffery). Rule counts are
 * therefore not independent, which is one more reason there is no total.
 */

import vocabulary from './vocabulary.mjs';
import copulaAvoidance from './copula-avoidance.mjs';
import negativeParallelism from './negative-parallelism.mjs';
import ruleOfThree from './rule-of-three.mjs';
import emDash from './em-dash.mjs';
import ingAnalysis from './ing-analysis.mjs';
import significanceInflation from './significance-inflation.mjs';
import puffery from './puffery.mjs';
import vagueAttribution from './vague-attribution.mjs';
import vagueAssociation from './vague-association.mjs';
import transitionOpeners from './transition-openers.mjs';
import challengesFormula from './challenges-formula.mjs';
import inlineHeaderLists from './inline-header-lists.mjs';
import boldOveruse from './bold-overuse.mjs';
import headingStyle from './heading-style.mjs';
import chatResidue from './chat-residue.mjs';
import modelArtifacts from './model-artifacts.mjs';
import didacticDisclaimers from './didactic-disclaimers.mjs';

export const CATEGORIES = ['vocabulary', 'structure', 'punctuation', 'attribution', 'formatting', 'artifact'];
export const WEIGHTS = ['weak', 'moderate', 'strong'];

export const RULES = [
  vocabulary, copulaAvoidance, negativeParallelism, ruleOfThree, emDash, ingAnalysis,
  significanceInflation, puffery, vagueAttribution, vagueAssociation, transitionOpeners,
  challengesFormula, inlineHeaderLists, boldOveruse, headingStyle, chatResidue,
  modelArtifacts, didacticDisclaimers,
];

export const RULE_IDS = RULES.map((r) => r.id);

export function getRule(id) {
  return RULES.find((r) => r.id === id) ?? null;
}

function checkIds(ids, flag) {
  const unknown = ids.filter((id) => !RULE_IDS.includes(id));
  if (unknown.length) {
    throw new Error(`${flag}: unknown rule ${unknown.map((u) => `"${u}"`).join(', ')}. Known rules: ${RULE_IDS.join(', ')}`);
  }
}

/**
 * Which rules run. An off-by-default rule runs when `historical` is set, when
 * it is named in `only`, or when it is named in `include`. `include` exists so
 * one such rule can be added to the default set without turning them all on.
 */
export function selectRules({ historical = false, only = [], ignore = [], include = [] } = {}) {
  checkIds(only, '--only');
  checkIds(ignore, '--ignore');
  checkIds(include, '--include');
  return RULES.filter((r) => {
    if (ignore.includes(r.id)) return false;
    if (only.length) return only.includes(r.id);
    return historical || include.includes(r.id) || !r.historical;
  });
}
