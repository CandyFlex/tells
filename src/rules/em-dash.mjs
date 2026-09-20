/**
 * em-dash: dashes per 1,000 words, against three published baselines.
 *
 * Counted as a dash: the em dash character, a spaced double hyphen ( -- ),
 * and a spaced en dash used as a dash. An unspaced en dash is a range
 * (1990-1995 written with an en dash) and is left alone.
 *
 * A finding is noted `comma-slot` when the dash sits between two words in
 * the middle of a clause and is not followed by a capital, which is the slot
 * the guide says a person would more often fill with a comma, a colon or
 * parentheses.
 *
 * THE NUMBERS, AND WHY THERE ARE THREE. Freeburg (arXiv:2603.27006) measured
 * GPT-4.1 at 10.62 per 1,000 words against a human control at 3.23. But
 * literary human prose is reported at 4.8 to 6.5 per 1,000 (a blog analysis,
 * not peer reviewed), which puts a deliberate stylist above the
 * nonprofessional baseline and close to some models. The same study found
 * model rates from 0.0 (Llama) upward, so a low rate is not evidence of a
 * human either. `aboveBaseline` compares against 3.23 only, and the report
 * prints all three figures so nobody has to take that comparison on faith.
 *
 * FALSE POSITIVES. Emily Dickinson. Anyone who learned to write from
 * novels, anyone using a word processor that converts a double hyphen, and
 * most magazine journalism. The corpus table in the README shows what this
 * rule reports for 19th-century prose; look there before trusting it.
 */
import { SOURCES, EM_DASH_BASELINE } from './lexicon.mjs';

const DASH = /\u{2014}|(?<=[^\s-]) -- (?=[^\s-])|(?<=[\p{L}\p{N}"'\u{201d}\u{2019},;:!?.)])--(?=[\p{L}"'\u{201c}\u{2018}(])|(?<=\S) \u{2013} (?=\S)/gu;

function detect(doc) {
  return doc.findAll(DASH, {
    note: (m) => {
      const at = m.index;
      const before = doc.text.slice(Math.max(0, at - 2), at).trimEnd();
      const after = doc.text.slice(at + m[0].length, at + m[0].length + 2).trimStart();
      const kind = m[0] === '\u{2014}' ? 'em dash' : m[0].includes('--') ? 'double hyphen' : 'spaced en dash';
      const commaSlot = /[\p{L}\p{N}]$/u.test(before) && /^\p{Ll}/u.test(after);
      return commaSlot ? `${kind}; comma-slot` : kind;
    },
  });
}

export default {
  id: 'em-dash',
  name: 'Em-dash density',
  category: 'punctuation',
  weight: 'weak',
  description:
    'Counts em dashes, double hyphens used as dashes and spaced en dashes per 1,000 words, and notes the ones sitting mid-clause where a comma would do. Compared against a measured human nonprofessional baseline of 3.23, with literary human prose (4.8 to 6.5) and GPT-4.1 (10.62) printed beside it. False positive: literary writers, magazine journalism and anyone whose word processor converts a double hyphen. Human literary prose overlaps the model range, and some models produce no em dashes at all, so neither a high nor a low rate identifies an author.',
  source: [SOURCES.freeburg, SOURCES.emergence, SOURCES.literaryDashes, SOURCES.wikipedia],
  baseline: EM_DASH_BASELINE,
  historical: false,
  detect,
};
