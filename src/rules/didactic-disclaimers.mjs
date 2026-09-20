/**
 * didactic-disclaimers: "It's important to note that". HISTORICAL.
 *
 * This was a strong habit of 2023 chat models and has faded from newer ones,
 * so the rule is off by default and kept for judging older text.
 * `--historical` turns it on.
 *
 * FALSE POSITIVES. Technical documentation says "Note that" constantly and
 * correctly. Legal and medical writing hedges for good reason.
 */
import { DIDACTIC_DISCLAIMERS, CAPITALISED_DISCLAIMERS, SOURCES } from './lexicon.mjs';
import { phraseRegex, inOrder } from './util.mjs';

// "Note that" and "Remember that" are matched with their capital only: "she
// left a note that said goodbye" is not a disclaimer.
const RE = phraseRegex(DIDACTIC_DISCLAIMERS.filter((p) => !CAPITALISED_DISCLAIMERS.includes(p)));
const CAPITALISED = phraseRegex(CAPITALISED_DISCLAIMERS, { flags: 'gu' });

export default {
  id: 'didactic-disclaimers',
  name: 'Didactic disclaimers',
  category: 'structure',
  weight: 'weak',
  description:
    'Counts lecturing asides: it is important to note, it is worth noting, keep in mind, bear in mind, it should be noted, Note that, Remember that. Historical: a habit of 2023 chat models that has faded, so the rule is off unless --historical or --include didactic-disclaimers is passed. False positive: technical documentation says "Note that" constantly and correctly, and legal and medical writing hedges for good reason. "Note that" and "Remember that" are counted only where they are capitalised, so a note that says goodbye is left alone.',
  source: [SOURCES.wikipedia],
  baseline: null,
  historical: true,
  detect: (doc) => inOrder([...doc.findAll(RE), ...doc.findAll(CAPITALISED)]),
};
