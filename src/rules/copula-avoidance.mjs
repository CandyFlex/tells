/**
 * copula-avoidance: "serves as a" where "is a" would do.
 *
 * The guide describes models replacing "is" and "are" with heavier verbs:
 * "X serves as a Y", "X stands as a Y", "X boasts a Y". The rule counts the
 * substitutes. It cannot tell whether "is" would have worked.
 *
 * FALSE POSITIVES. These are ordinary verbs. A waiter serves as many tables
 * as he can. A glossary says a term "refers to" something because that is
 * what a glossary is for. A shop "offers a" discount. A person who held an
 * office "served as" treasurer. Only a run of them in descriptive prose,
 * where plain "is" was available each time, is worth a second look.
 */
import { COPULA_SUBSTITUTES, SOURCES } from './lexicon.mjs';
import { phraseRegex } from './util.mjs';

const RE = phraseRegex(COPULA_SUBSTITUTES);

export default {
  id: 'copula-avoidance',
  name: 'Copula avoidance',
  category: 'vocabulary',
  weight: 'weak',
  description:
    'Counts verbs used in place of "is" or "are": serves as, stands as, functions as, operates as, represents a, marks a, boasts, features a, offers a, refers to. False positive: all of these are ordinary verbs. A person "served as" treasurer, a glossary says a term "refers to" something, a shop "offers a" discount. The rule cannot tell whether plain "is" would have worked.',
  source: [SOURCES.wikipedia],
  baseline: null,
  historical: false,
  detect: (doc) => doc.findAll(RE),
};
