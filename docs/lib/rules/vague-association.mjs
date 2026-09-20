/**
 * vague-association: "linked to", with nothing on the other end.
 *
 * The guide describes models asserting a connection without saying what the
 * connection is or what it connects to: "the festival is associated with
 * various cultural traditions". The rule finds the connective and then looks
 * at the next 6 words. If they contain a named object (a capitalised word
 * that is not just the start of a sentence, a number, or a quoted title) the
 * claim has a referent and nothing is reported.
 *
 * FALSE POSITIVES. Epidemiology and statistics use "associated with" as a
 * term of art for a measured correlation ("smoking is associated with higher
 * mortality"), with a common noun as the object. That is precise writing and
 * this rule will count it. Weak for that reason.
 */
import { VAGUE_ASSOCIATION, SOURCES } from './lexicon.mjs';
import { phraseRegex } from './util.mjs';

const RE = phraseRegex(VAGUE_ASSOCIATION);
const LOOKAHEAD_WORDS = 6;

function hasNamedObject(doc, from) {
  const s = doc.sentenceAt(from - 1);
  const limit = s ? s.end : from + 80;
  const tail = doc.text.slice(from, limit);
  const words = tail.match(/\S+/gu) || [];
  return words.slice(0, LOOKAHEAD_WORDS).some((w) => /^["'\u{201c}(]?(?:\p{Lu}|\d)/u.test(w));
}

function detect(doc) {
  return doc.findAll(RE, { filter: (m, offset) => !hasNamedObject(doc, offset + m[0].length) });
}

export default {
  id: 'vague-association',
  name: 'Vague association',
  category: 'attribution',
  weight: 'weak',
  description:
    'Counts connectives (in connection with, associated with, in association with, connected to, linked to) that are not followed within 6 words by a named object: a capitalised name, a number or a quoted title. False positive: epidemiology and statistics use "associated with" as a term of art for a measured correlation, with a common noun as the object. That is precise writing and this rule will still count it.',
  source: [SOURCES.wikipedia],
  baseline: null,
  historical: false,
  detect,
};
