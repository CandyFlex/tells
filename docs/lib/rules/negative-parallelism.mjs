/**
 * negative-parallelism: "It's not just X, it's Y."
 *
 * The guide catalogues three families, and each finding records which one it
 * is in `note`:
 *
 *   not-only-but       "not only X but (also) Y"
 *   not-just           "not just X, it's Y" / "isn't just" / "doesn't just"
 *   not-x-its-y        "it's not X, it's Y"
 *   no-x-no-y-just-z   "no X, no Y, just Z"
 *   not-but-rather     "not X but rather Y"
 *   rather-than        a sentence that opens "Rather than X, ..."
 *
 * FALSE POSITIVES. "Not only ... but also" is a correlative conjunction
 * taught in every grammar book, and it is all over legal drafting and
 * sermons. One of them in a document is grammar. The rule skips a match that
 * sits inside a quotation, because those words belong to whoever is being
 * quoted, but it cannot tell a writer's considered contrast from a reflex.
 */
import { SOURCES } from './lexicon.mjs';
import { phraseSource, preferLongest, insideQuotation, sentenceOpening } from './util.mjs';

const p = (source) => new RegExp(phraseSource(source), 'giu');
const NOT_TERMINAL = '[^.!?\\n]|\\n(?!\\n)';

// A match must start on a word boundary. "isn't just" used to be matched from
// the apostrophe, because the alternation was (?:\bnot|n't), so the reported
// span opened mid-word ("n't just a place") and an editor reading the SARIF
// region underlined from inside "isn". The apostrophes are written as escapes
// because phraseSource rewrites a literal ' and would break a character class.
const CONTRACTED_NOT = "\\b[\\p{L}\\u{27}\\u{2019}]*n[\\u{27}\\u{2019}]t\\b";
const NEGATION = `(?:\\bnot\\b|${CONTRACTED_NOT})`;

const PATTERNS = [
  ['not-only-but', p(`\\bnot only\\b(?:${NOT_TERMINAL}){1,140}?\\bbut\\b(?: also\\b)?`)],
  ['not-but-rather', p(`\\bnot\\b(?:${NOT_TERMINAL}){1,120}?\\bbut rather\\b`)],
  ['not-x-its-y', p(`\\b(?:it's|it is|this is|that's|that is) not\\b(?! just| only| merely| simply)(?:${NOT_TERMINAL}){1,100}?[,;\\u{2014}] ?(?:it's|it is)\\b`)],
  ['not-just', p(`${NEGATION} (?:just|merely|simply|solely|purely)\\b(?:${NOT_TERMINAL}){1,100}?[,;\\u{2014}] ?(?:it's|it is|but|they're|they are)\\b`)],
  ['not-just', p(`\\b(?:isn't|is not|aren't|are not|wasn't|doesn't|does not|don't|didn't) (?:just|solely|purely)\\b`)],
  ['no-x-no-y-just-z', p(`\\bno [^,.!?\\n]{1,40}, no [^,.!?\\n]{1,40},? just\\b`)],
];

const RATHER_THAN = /^Rather than\b[^.!?]{1,140}?,/u;

function detect(doc) {
  const found = [];
  for (const [note, re] of PATTERNS) {
    found.push(...doc.findAll(re, { note, filter: (m, offset) => !insideQuotation(doc, offset) }));
  }
  for (const s of doc.proseSentences) {
    const at = sentenceOpening(doc, s);
    const m = RATHER_THAN.exec(doc.text.slice(at, s.end));
    if (m) found.push(doc.finding(at, m[0].length, 'rather-than'));
  }
  return preferLongest(found);
}

export default {
  id: 'negative-parallelism',
  name: 'Negative parallelism',
  category: 'structure',
  weight: 'moderate',
  description:
    'Counts contrast frames that deny one thing to assert another: not only X but also Y; not just X, it is Y; is not just; does not just; it is not X, it is Y; no X, no Y, just Z; not X but rather Y; and sentences opening "Rather than X,". The sub-type is recorded in each finding. False positive: "not only ... but also" is a correlative conjunction from every grammar book and is common in legal drafting and sermons. One in a document is grammar. Matches inside a quotation are skipped, but the rule cannot tell a considered contrast from a reflex.',
  source: [SOURCES.wikipedia],
  baseline: null,
  historical: false,
  detect,
};
