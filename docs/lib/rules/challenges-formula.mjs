/**
 * challenges-formula: "Despite its successes, X faces several challenges."
 *
 * The guide describes an outline models reach for at the end of an article:
 * a "Challenges and Future Outlook" section that concedes unnamed challenges
 * and then looks ahead with optimism. Four shapes are counted, and `note`
 * says which:
 *
 *   despite-challenges   "Despite / Notwithstanding / In spite of
 *                        (its|these|the|their|this) ... challenges/obstacles"
 *   heading              a heading reading "Challenges and Future ...",
 *                        "Challenges and the Road Ahead", "Future
 *                        Outlook/Directions/Prospects", "The Road Ahead",
 *                        "Looking ahead"
 *   looking-ahead        a sentence that opens "Looking ahead," "Looking
 *                        forwards," "Going forward," or "Moving forward,"
 *   closing-paragraph    the final paragraph opens with In conclusion,
 *                        Overall, Ultimately, In summary, To summarise,
 *                        To sum up or In closing
 *
 * FALSE POSITIVES. "Future Directions" is a conventional heading in
 * scientific papers and grant reports, and a school essay is supposed to end
 * with "In conclusion". A real challenges section names the challenges; the
 * rule cannot check that, so read what follows the finding.
 */
import { CHALLENGE_HEADINGS, CLOSING_OPENERS, SOURCES } from './lexicon.mjs';
import { phraseSource, sentenceOpening, inOrder } from './util.mjs';

// "Notwithstanding its many successes" is the same sentence with a longer
// conjunction, and the rule claimed the shape, not the word.
const DESPITE = new RegExp(
  phraseSource('\\b(?:Despite|Notwithstanding|In spite of) (?:its|these|the|their|this)\\b(?:[^.!?\\n]|\\n(?!\\n)){0,140}?\\b(?:challenges|obstacles|hurdles|setbacks)\\b'),
  'giu',
);
const HEADING = new RegExp(`^(?:\\d+[.)]\\s+)?(?:${CHALLENGE_HEADINGS.map(phraseSource).join('|')})\\s*:?$`, 'iu');
const LOOKING_AHEAD = /^(?:Looking (?:ahead|forward|forwards)|Going forward|Moving forward),/u;
const CLOSING = new RegExp(`^(?:${CLOSING_OPENERS.map(phraseSource).join('|')})(?![\\p{L}])`, 'u');

function detect(doc) {
  const found = doc.findAll(DESPITE, { note: 'despite-challenges' });

  for (const s of doc.sentences) {
    const at = sentenceOpening(doc, s);
    const text = doc.text.slice(at, s.end).replace(/[*_]+$/u, '');
    if (s.kind === 'heading') {
      const m = HEADING.exec(text.trim());
      if (m) found.push(doc.finding(at, text.trimEnd().length, 'heading'));
    } else if (s.kind === 'prose' || s.kind === 'list') {
      const m = LOOKING_AHEAD.exec(text);
      if (m) found.push(doc.finding(at, m[0].length - 1, 'looking-ahead'));
    }
  }

  const last = doc.paragraphs[doc.paragraphs.length - 1];
  if (last && doc.paragraphs.length > 1) {
    const first = doc.proseSentences.find((s) => s.start >= last.start && s.start < last.end);
    if (first) {
      const at = sentenceOpening(doc, first);
      const m = CLOSING.exec(doc.text.slice(at, first.end));
      if (m) found.push(doc.finding(at, m[0].length, 'closing-paragraph'));
    }
  }
  return inOrder(found);
}

export default {
  id: 'challenges-formula',
  name: 'Challenges-and-outlook formula',
  category: 'structure',
  weight: 'moderate',
  description:
    'Counts the stock ending: "Despite its ... challenges" (also Notwithstanding and In spite of), a heading such as Challenges and Future Outlook, Challenges and the Road Ahead, Future Directions or Looking Ahead, a sentence opening "Looking ahead," "Looking forwards," "Going forward," or "Moving forward,", and a final paragraph that opens with In conclusion, Overall, Ultimately, In summary, To summarise, To sum up or In closing. False positive: "Future Directions" is a conventional heading in scientific papers and grant reports, and a school essay is supposed to end with "In conclusion". A real challenges section names the challenges; the rule cannot check that.',
  source: [SOURCES.wikipedia],
  baseline: null,
  historical: false,
  detect,
};
