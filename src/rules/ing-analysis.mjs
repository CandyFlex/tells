/**
 * ing-analysis: ", highlighting the importance of the approach."
 *
 * A comma, then a present participle from a short list, then a clause that
 * runs to the end of the sentence and tells the reader what to think of what
 * they just read. The guide calls it superficial analysis: the clause asserts
 * significance without adding a fact.
 *
 * The rule requires all of: the participle is on the list, it directly
 * follows a comma (optionally after "thereby", "thus" or "further"), and the
 * clause it opens closes the sentence within 25 words. A participle that
 * opens a sentence, or has no comma before it, is ordinary grammar and is
 * not matched.
 *
 * FALSE POSITIVES. A participial clause that reports something that
 * happened is good writing: "She spent the winter in Ghent, ensuring the
 * archive was catalogued before the move." The rule matches the shape and
 * cannot tell an action from a gloss. Read the finding; if the clause states
 * a fact, leave it.
 */
import { ING_PARTICIPLES, SOURCES } from './lexicon.mjs';
import { phraseSource } from './util.mjs';

const MAX_CLAUSE_WORDS = 25;
const RESUMES = /,\s+(?:was|were|is|are|has|have|had|will|would|did|does|do|can|could|should|became|remains?|went|came|made|took)\b/u;
const RE = new RegExp(
  `,(?:\\s+(?:thereby|thus|further|ultimately))?\\s+((?:${ING_PARTICIPLES.map(phraseSource).join('|')})\\b[^.!?]*[.!?]*["'\\u{201d}\\u{2019})]*)\\s*$`,
  'iu',
);

function detect(doc) {
  const found = [];
  for (const s of doc.proseSentences) {
    const text = doc.text.slice(s.start, s.end);
    const m = RE.exec(text);
    if (!m) continue;
    const clause = m[1];
    if (clause.split(/\s+/).length > MAX_CLAUSE_WORDS) continue;
    // ", highlighting three failures, was shelved": the main clause resumes,
    // so the participle does not close the sentence.
    if (RESUMES.test(clause)) continue;
    const offset = s.start + m.index + m[0].indexOf(clause);
    const participle = /^[\p{L}]+(?:\s+to\b)?/u.exec(clause)[0].toLowerCase().replace(/\s+/g, ' ');
    found.push(doc.finding(offset, clause.trimEnd().length, participle));
  }
  return found;
}

export default {
  id: 'ing-analysis',
  name: 'Trailing -ing analysis',
  category: 'structure',
  weight: 'moderate',
  description:
    'Counts sentences that end in a comma followed by a present-participle clause from a fixed list (highlighting, underscoring, emphasizing, reflecting, symbolizing, showcasing, ensuring, contributing to, fostering, cultivating, encompassing, enhancing, demonstrating, signaling, marking, solidifying, cementing), where the clause comments on the sentence instead of adding to it. False positive: a participial clause that reports an action is good writing, as in "She spent the winter in Ghent, ensuring the archive was catalogued before the move." The rule matches the shape and cannot tell an action from a gloss.',
  source: [SOURCES.wikipedia],
  baseline: null,
  historical: false,
  detect,
};
