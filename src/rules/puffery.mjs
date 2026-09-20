/**
 * puffery: promotional adjectives and brochure phrases.
 *
 * FALSE POSITIVES. This is the rule most likely to describe a human. Press
 * releases, tourism copy, property listings and fan wikis were puffy decades
 * before language models, and the guide this draws on says so: promotional
 * tone alone does not indicate machine writing. "Rich" is only counted
 * before history, tapestry or heritage, so a rich sauce is left alone, but
 * "profound" grief and a "renowned" surgeon will still be counted.
 */
import { PUFFERY, SOURCES } from './lexicon.mjs';
import { phraseRegex } from './util.mjs';

const RE = phraseRegex(PUFFERY);

export default {
  id: 'puffery',
  name: 'Promotional puffery',
  category: 'vocabulary',
  weight: 'weak',
  description:
    'Counts brochure language: boasts, vibrant, rich history or tapestry or heritage, profound, renowned, groundbreaking, nestled, in the heart of, diverse array, commitment to, state-of-the-art, world-class, cutting-edge, seamless, unparalleled, must-visit, breathtaking. False positive: human press releases, tourism copy and property listings were puffy long before language models, and the source guide says promotional tone alone does not indicate machine writing.',
  source: [SOURCES.wikipedia],
  baseline: null,
  historical: false,
  detect: (doc) => doc.findAll(RE),
};
