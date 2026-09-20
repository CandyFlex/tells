/**
 * stats.mjs: descriptive statistics. Reported, never judged.
 *
 * These are the numbers people expect a tool like this to grade them on:
 * sentence-length variance ("burstiness"), vocabulary variety, repetition.
 * Tells prints them and attaches no threshold, no baseline and no colour,
 * for a specific reason. Low variance and plain vocabulary are what a careful
 * second-language writer produces, and keying on them is how commercial
 * detectors came to flag 61% of non-native English essays as machine-written
 * (Liang et al., Patterns, 2023, arXiv:2304.02819). GPTZero, the vendor that
 * popularised perplexity and burstiness, stopped using them in 2023.
 *
 * So the label below travels with the numbers in every format, and no rule
 * reads this module.
 */

import { SOURCES } from './rules/lexicon.mjs';

/**
 * The label travels with the numbers in every format. It names GPTZero
 * because the claim is about GPTZero, and it now carries the URL, because the
 * source was defined in the lexicon and reached no output: every report made
 * a checkable-sounding claim about a named vendor with nothing to check.
 */
export const STATS_SOURCE = SOURCES.gptzero;

export const STATS_LABEL =
  `descriptive statistics; detectors abandoned perplexity and burstiness as signals in 2023 (GPTZero, ${SOURCES.gptzero.url}); reported for the writer's information only`;

/** Type-token ratio is computed over this many words so documents of different lengths compare. */
export const TTR_WINDOW = 500;

const round = (x, places = 2) => {
  const f = 10 ** places;
  return Math.round(x * f) / f;
};

function meanSd(values) {
  if (!values.length) return { mean: null, sd: null, n: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  // Population sd: this describes the document in hand, it does not estimate a wider population.
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return { mean: round(mean), sd: round(sd), n: values.length };
}

/**
 * @param {object} doc  a parsed document (see document.mjs)
 */
export function describe(doc) {
  const sentences = doc.proseSentences.filter((s) => s.words > 0);
  const lengths = sentences.map((s) => s.words);

  let longest = null;
  let shortest = null;
  for (const s of sentences) {
    if (!longest || s.words > longest.words) longest = s;
    if (!shortest || s.words < shortest.words) shortest = s;
  }
  const where = (s) => (s ? { words: s.words, ...doc.locate(s.start) } : null);

  let sameOpeners = 0;
  for (let i = 1; i < sentences.length; i++) {
    if (sentences[i].firstWord && sentences[i].firstWord === sentences[i - 1].firstWord) sameOpeners++;
  }

  const window = doc.words.slice(0, TTR_WINDOW).map((w) => w.text.toLowerCase());
  const types = new Set(window).size;

  return {
    label: STATS_LABEL,
    sentenceLength: { ...meanSd(lengths), unit: 'words' },
    paragraphLength: { ...meanSd(doc.paragraphs.map((p) => p.sentences)), unit: 'sentences' },
    typeTokenRatio: {
      value: window.length ? round(types / window.length, 3) : null,
      types,
      tokens: window.length,
      window: TTR_WINDOW,
      note: window.length < TTR_WINDOW
        ? `document has fewer than ${TTR_WINDOW} words; not comparable with longer documents`
        : `first ${TTR_WINDOW} words`,
    },
    repeatedOpeners: {
      count: sameOpeners,
      of: Math.max(0, sentences.length - 1),
      share: sentences.length > 1 ? round(sameOpeners / (sentences.length - 1), 3) : null,
    },
    longestSentence: where(longest),
    shortestSentence: where(shortest),
    punctuation: {
      emDashes: doc.counts.emDashes,
      enDashes: doc.counts.enDashes,
      semicolons: doc.counts.semicolons,
      colons: doc.counts.colons,
      questions: doc.counts.questions,
    },
    structure: {
      headings: doc.counts.headings,
      listItems: doc.counts.listItems,
      boldSpans: doc.counts.boldSpans,
    },
  };
}
