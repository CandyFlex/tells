/**
 * significance-inflation: claims of importance with nothing behind them.
 *
 * "Stands as a testament to", "played a pivotal role", "left an indelible
 * mark". The guide's point is that these assert significance instead of
 * showing it, and that models attach them to mundane subjects.
 *
 * FALSE POSITIVES. Obituaries, award citations, grant applications and
 * museum labels are written this way by people, on purpose. "Played a key
 * role" is plain reporting when the next sentence says what the role was.
 * The rule matches the phrase; it does not check whether evidence follows.
 */
import { SIGNIFICANCE, SOURCES } from './lexicon.mjs';
import { phraseRegex } from './util.mjs';

const RE = phraseRegex(SIGNIFICANCE);

export default {
  id: 'significance-inflation',
  name: 'Inflated significance',
  category: 'vocabulary',
  weight: 'moderate',
  description:
    'Counts stock phrases that assert importance or legacy: testament to, pivotal, crucial or vital or key role, underscores the importance, indelible mark or impression, deeply rooted, evolving landscape, focal point, setting the stage, key turning point, reflects broader, enduring or lasting legacy, stands as a, is a reminder. False positive: obituaries, award citations and grant applications are written this way by people, and "played a key role" is plain reporting when the next sentence says what the role was. The rule does not check whether evidence follows.',
  source: [SOURCES.wikipedia],
  baseline: null,
  historical: false,
  detect: (doc) => doc.findAll(RE),
};
