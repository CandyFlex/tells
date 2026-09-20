/**
 * vague-attribution: "experts say", with no expert.
 *
 * The guide's description is weasel wording with few or no actual citations.
 * So the rule has two halves, and the second matters more than the first:
 *
 *   1. find the phrase
 *   2. SUPPRESS the finding when the same sentence or the next one carries
 *      something checkable: a URL, a bracketed citation ([3], [^3], [Smith
 *      2019]), a year in parentheses, or a number with a unit
 *
 * "Studies show a 23% drop in no-shows (Hwang 2019)" is attribution done
 * properly and produces nothing. URLs are masked in the prose view, so the
 * evidence check reads the raw text.
 *
 * FALSE POSITIVES. Journalism paraphrases sources named earlier in the
 * piece ("critics argue" three paragraphs after naming the critics); the rule
 * only looks one sentence ahead. Casual writing says "some say" without
 * needing a footnote. And a citation can be fake: the rule checks that
 * something citation-shaped is present, not that it is real.
 */
import { VAGUE_ATTRIBUTION, SOURCES } from './lexicon.mjs';
import { phraseRegex } from './util.mjs';

const RE = phraseRegex(VAGUE_ATTRIBUTION);

const UNITS = 'percent|%|km|kilomet(?:er|re)s?|miles?|m|cm|mm|kg|g|lbs?|pounds?|tons?|tonnes?|hours?|minutes?|seconds?|days?|weeks?|months?|years?|people|participants|respondents|patients|dollars|USD|EUR|GBP|points?|times|fold|x';
const EVIDENCE = [
  /\bhttps?:\/\/|\bwww\.|\bdoi:/i,
  /\[\^?\d+\]|\[[^\]\n]*\b(?:1[5-9]|20)\d{2}[a-z]?\]|\[citation[^\]]*\]/i,
  /\((?:[^()\n]*[\s,])?(?:1[5-9]|20)\d{2}[a-z]?(?:[,;][^()\n]*)?\)/,
  new RegExp(`(?:[$\\u{20ac}\\u{a3}]\\s?\\d)|\\b\\d[\\d,.]*\\s?(?:${UNITS})(?![\\p{L}])`, 'iu'),
];

function hasEvidence(doc, sentence) {
  if (!sentence) return false;
  const i = doc.sentences.indexOf(sentence);
  const next = doc.sentences[i + 1];
  // Read the raw text: the URL that would excuse the claim is masked in the prose view.
  const end = next && next.kind !== 'heading' ? next.end : sentence.end;
  const raw = doc.raw.slice(sentence.start, end);
  return EVIDENCE.some((re) => re.test(raw));
}

function detect(doc) {
  return doc.findAll(RE, { filter: (m, offset) => !hasEvidence(doc, doc.sentenceAt(offset)) });
}

export default {
  id: 'vague-attribution',
  name: 'Vague attribution',
  category: 'attribution',
  weight: 'moderate',
  description:
    'Counts appeals to unnamed authority: experts say, studies show, research suggests, industry reports, observers, critics argue, analysts have observed, commentators contend, many in the industry maintain, it is widely believed, many believe, some say, according to some. A finding is dropped when the same sentence or the next one contains a URL, a bracketed citation, a year in parentheses or a number with a unit. False positive: journalism that named its sources several paragraphs earlier, and casual writing where "some say" needs no footnote. The rule checks that something citation-shaped is nearby, not that the citation is real.',
  source: [SOURCES.wikipedia],
  baseline: null,
  historical: false,
  detect,
};
