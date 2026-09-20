/**
 * rule-of-three: "fast, reliable, and scalable".
 *
 * The guide says models default to triplets when listing anything. The rule
 * finds two shapes inside a sentence:
 *
 *   list        A, B, and C  /  A, B and C  /  A, B, or C   (exactly three)
 *   adjectives  a fast, reliable, scalable platform          (three before a noun)
 *
 * and reports density per 1,000 words and the share of sentences that carry
 * one, because a single triad says nothing and a triad in every paragraph
 * says something about rhythm.
 *
 * WHY THE CONDITIONS BELOW EXIST. The first version of this rule was the
 * naive pattern "word, a few words, and word". Run over this project's own
 * corpus it matched Madison's "on the other side, as was wished and
 * expected" and Thoreau's "divine, but the slave and prisoner": commas that
 * end a clause, followed by an ordinary "and". It reported 11 triads in the
 * Federalist passage and most were not lists at all. (That first run is kept
 * in studies/2026-09-19-corpus/first-run-results.json.) So:
 *
 *   - the middle item may not open with a word that starts a clause or a
 *     phrase (as, who, which, but, and, or, there, especially ...), and may
 *     not contain "and" or "or" itself
 *   - with a serial comma (A, B, and C) the middle item may run to 4 words;
 *     without one (A, B and C) the comma is more likely a clause boundary,
 *     so the middle item is held to 2 words and may not open with a determiner
 *   - if the middle item opens with a determiner, the last must too
 *     ("the same opinions, the same passions, and the same interests")
 *   - lists of four or more, items holding a digit, capitalised names, and
 *     bullet items that are fragments and not sentences are inventories, not
 *     rhetoric, and are skipped
 *
 * This still cannot parse English. It misses triads with long members and
 * triads of clauses, and it will sometimes read a clause boundary as a list.
 *
 * OFF BY DEFAULT, and this is why. A review in September 2026 ran the rule
 * over eight human passages written for the purpose: a recipe, a
 * limitation-of-liability clause, a match report, a hydrology abstract, a
 * press release, an email from a second-language PhD student, a Go tool
 * README and a eulogy. Twelve findings came out of the set and nine of them
 * were this rule, which was the only rule to fire in the recipe, the match
 * report, the clause and the eulogy. "Indirect, incidental, or consequential
 * damages" is boilerplate in every commercial contract in the language.
 *
 * On this project's own corpus it separates nothing: the highest human rate
 * reaches the machine rate, which the README table shows. A rule that
 * separates nothing in-sample and produces most of the noise out-of-sample
 * does not belong in the default set, so it runs only when asked for:
 *
 *   tells draft.md --include rule-of-three
 *
 * It is kept, rather than deleted, because the triad is a real habit and the
 * density is worth looking at once a reader has decided to look.
 *
 * FALSE POSITIVES. A list of three is often just a list of three things. If
 * a recipe says "whisk the flour, sugar, and salt", that is an ingredient
 * list the heuristics above did not catch. Rhetorical triads are also one of
 * the oldest human devices in English ("life, liberty, and the pursuit of
 * happiness").
 */
import { SOURCES } from './lexicon.mjs';
import { per1k } from '../document.mjs';
import { withoutOverlaps } from './util.mjs';

const W = "[\\p{L}][\\p{L}\\p{M}'\\u{2019}-]*";
const ITEM = `${W}(?: ${W}){0,3}`;
// One word before the first comma anchors the match. The reported span is
// then widened back to the start of the first list item (see firstItemOf),
// because a match that opens mid-item misnames the list: "Stop by the shop at
// 214 Alder Street, give us a call, or join us" was reported as
// "Street, give us a call, or join", which presents a street name as a list
// member. When the first item cannot be recognised, nothing is reported.
const LIST = new RegExp(`(${W}), (${ITEM})(,?) (and|or) (${ITEM})`, 'gu');
const WORD_RE = new RegExp(W, 'gu');
const ONE_WORD = new RegExp(`^${W}$`, 'u');
const ADJECTIVES = new RegExp(`\\b(?:an?|the|our|its|their|this|that|his|her|your) (${W}), (${W}), (${W}) ${W}`, 'giu');

const CLAUSE_OPENERS = new Set([
  'as', 'who', 'whom', 'whose', 'which', 'that', 'but', 'and', 'or', 'nor', 'if', 'when', 'while', 'where', 'because',
  'since', 'so', 'though', 'although', 'to', 'of', 'for', 'in', 'on', 'at', 'by', 'with', 'from', 'into', 'is', 'was',
  'were', 'are', 'be', 'been', 'it', 'he', 'she', 'they', 'we', 'i', 'you', 'not', 'no', 'there', 'then', 'than',
  'especially', 'particularly', 'including', 'however', 'more', 'most', 'even', 'also', 'yet', 'thus', 'hence',
  'without', 'within', 'under', 'over', 'through', 'after', 'before', 'about', 'against', 'between', 'upon', 'like',
]);
const DETERMINERS = new Set(['the', 'a', 'an', 'his', 'her', 'its', 'their', 'our', 'your', 'my', 'this', 'that', 'these', 'those', 'some', 'any']);

const INTRO = /^(?:In|On|At|During|After|Before|For|With|By|Since|Over|Under|From|Through|Throughout|Across|Among|As|When|While|If)\s/u;
const PRONOUN =/^(?:you|we|they|i|he|she|it|there|that|who)(?:['\u{2019}](?:ll|re|ve|d|s|m))?$/iu;
const opensClause = (word) => CLAUSE_OPENERS.has(word.toLowerCase()) || PRONOUN.test(word);

const isName = (item) => /^\p{Lu}/u.test(item);
const first = (item) => item.split(' ')[0].toLowerCase();

/**
 * The first member of the list, found by parallelism: it is as many words
 * long as the middle member, read back from the comma and never across
 * another comma, a semicolon, a colon or a bracket.
 *
 * WHY. The match used to start at the one word before the first comma, so the
 * evidence handed to the reader was a fragment that misnamed the list:
 * "Street, give us a call, or join" on "Stop by the shop at 214 Alder Street,
 * give us a call, or join us for a Saturday ride". Either all three members
 * are shown or nothing is reported.
 *
 * @returns {{start: number, text: string}|null} null when what sits in the
 *   first slot is not a list item: it holds a digit or punctuation, or it
 *   opens with a word that starts a clause rather than names a thing.
 */
function firstItemOf(text, commaAt, wantWords) {
  const before = text.slice(0, commaAt);
  const boundary = Math.max(before.lastIndexOf(','), before.lastIndexOf(';'), before.lastIndexOf(':'), before.lastIndexOf('('));
  const region = before.slice(boundary + 1);
  const words = [...region.matchAll(WORD_RE)];
  if (!words.length) return null;
  const take = words[Math.max(0, words.length - wantWords)];
  const start = boundary + 1 + take.index;
  const item = text.slice(start, commaAt);
  const parts = item.split(/\s+/).filter(Boolean);
  if (!parts.length || parts.some((w) => !ONE_WORD.test(w))) return null;
  if (opensClause(parts[0])) return null;
  return { start, text: item };
}

/** The first `n` words of a captured member, so the span ends where it ends. */
function trimTo(item, n) {
  const words = [...item.matchAll(WORD_RE)];
  if (words.length <= n) return item;
  const cut = words[n];
  return item.slice(0, cut.index).replace(/\s+$/, '');
}

function isTriad(a, b, serialComma, c) {
  const bWords = b.toLowerCase().split(' ');
  if (CLAUSE_OPENERS.has(bWords[0]) || CLAUSE_OPENERS.has(c.toLowerCase()) || CLAUSE_OPENERS.has(a.toLowerCase())) return false;
  if (bWords.some((w) => w === 'and' || w === 'or' || w === 'but')) return false;
  const bDet = DETERMINERS.has(bWords[0]);
  if (!serialComma && (bWords.length > 2 || bDet)) return false;
  if (bDet && !DETERMINERS.has(c.toLowerCase())) return false;
  return true;
}

function detect(doc) {
  const found = [];
  for (const s of doc.proseSentences) {
    const text = doc.text.slice(s.start, s.end).replace(/\n/g, ' ');
    // A bullet that is a fragment ("- flour, sugar, and salt") is an
    // inventory. A bullet that is a full sentence is prose like any other.
    if (s.kind === 'list' && !/[.!?]["'\u{201d}\u{2019})*_]*$/u.test(text)) continue;
    // Quantities on both sides of a comma: an inventory. The thousands
    // separator in "1,400" is not a list comma.
    const figures = text.replace(/(\d),(?=\d{3})/g, '$1');
    if (/\d[^,]*,/.test(figures) && /,[^,]*\d/.test(figures)) continue;

    for (const m of text.matchAll(LIST)) {
      // A fourth item precedes (so this is not exactly three) when the words
      // between the previous comma and this match look like a list member
      // and not like the start of a clause ("On Saturday, you'll find A, B, and C").
      const lead = /,\s*((?:[\p{L}'\u{2019}-]+\s+){0,3})$/u.exec(text.slice(Math.max(0, m.index - 40), m.index));
      if (lead && !opensClause(lead[1].trim().split(/\s+/)[0] || m[1])) continue;
      // The members are parallel in length, so the last one is cut to the
      // middle one's word count: "and celery and cook until soft" is one
      // member, "celery", followed by more sentence.
      const middleWords = (m[2].match(WORD_RE) ?? []).length;
      const tail = trimTo(m[5], middleWords);
      const tailStart = m.index + m[0].length - m[5].length;
      const end = tailStart + tail.length;
      if (/^,/.test(text.slice(end, end + 1))) continue;
      // Named things are an inventory. The first item is not tested: it may be
      // capitalised only because it opens the sentence.
      if (isName(m[2]) && (isName(tail) || (isName(m[1]) && m.index > 0))) continue; // also "Concord, Massachusetts, and earned"
      // A proper noun anywhere inside the middle member means this comma ended
      // a clause: "in his own half of the chest, turned Reid, and finished".
      if (m[2].split(' ').slice(1).some(isName)) continue;
      // A preposition inside the middle member means the same: "Reduce by
      // half, taste for salt, and spoon over the rice" is three instructions
      // with their objects, not three items.
      if (m[2].toLowerCase().split(' ').slice(0, -1).some((w) => CLAUSE_OPENERS.has(w))) continue;
      // All three members have to be recognisable as list items, and the span
      // has to cover all three, or the evidence names something that is not
      // there.
      const head = firstItemOf(text, m.index + m[1].length, middleWords);
      if (!head) continue;
      if (/\d/.test(text.slice(head.start, end))) continue;
      const headLast = head.text.split(' ').pop();
      if (!isTriad(headLast, m[2], m[3] === ',', tail.split(' ')[0])) continue;
      // "In recent years, federal and state governments": without a serial
      // comma, the first comma after an opening preposition ends the
      // introductory phrase. It does not start a list.
      if (m[3] !== ',' && INTRO.test(text) && !text.slice(0, m.index + m[1].length).includes(',')) continue;
      found.push(doc.finding(s.start + head.start, end - head.start, `list of three, joined by "${m[4]}"`));
    }
    for (const m of text.matchAll(ADJECTIVES)) {
      const items = [m[1], m[2], m[3]];
      if (items.some(isName) || items.some((x) => CLAUSE_OPENERS.has(first(x)) || DETERMINERS.has(first(x)))) continue;
      found.push(doc.finding(s.start + m.index, m[0].length, 'three adjectives before a noun'));
    }
  }
  return withoutOverlaps(found);
}

function detail(doc, findings) {
  const sentences = new Set(findings.map((f) => doc.sentenceAt(f.offset)).filter(Boolean));
  return {
    sentencesWithTriad: sentences.size,
    sentences: doc.counts.sentences,
    shareOfSentences: doc.counts.sentences ? Math.round((sentences.size / doc.counts.sentences) * 1000) / 1000 : null,
    per1k: per1k(findings.length, doc.counts.words),
  };
}

export default {
  id: 'rule-of-three',
  name: 'Rule of three',
  category: 'structure',
  weight: 'weak',
  description:
    'Counts lists of exactly three items (A, B, and C; A, B and C; A, B, or C) and three adjectives stacked before a noun, and reports the share of sentences that carry one. All three members must be recognisable list items or nothing is reported, so the span shown covers the whole list. Lists of four or more, items with digits, capitalised names and bullet fragments are skipped as inventories. Off by default: run it with --include rule-of-three. It was demoted after a September 2026 review because on this project\'s own corpus the top human rate reaches the machine rate, so the rule separates nothing in-sample, and because in a set of eight human passages written for that review it produced nine of the twelve findings and was the only rule to fire in a recipe, a eulogy, a match report and a limitation-of-liability clause. False positive: a list of three is often just a list of three things, and the rhetorical triad is one of the oldest human devices in English. "Indirect, incidental, or consequential" is boilerplate in every commercial contract in the language, and it is counted.',
  source: [SOURCES.wikipedia],
  baseline: null,
  historical: true,
  detect,
  detail,
};
