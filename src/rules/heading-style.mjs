/**
 * heading-style: five formatting habits around headings and section breaks.
 *
 *   title-case       a heading with 3 or more capitalised words after the first
 *   empty-section    a heading (level 2 or deeper) followed directly by a
 *                    deeper heading, with no body of its own
 *   skipped-level    a jump of more than one level down (## then ####)
 *   thematic-break   a --- rule placed directly before a heading
 *   emoji-marker     an emoji opening a heading, a list item or a line
 *
 * Formatting rule: reads the structure view (code blanked, all else raw).
 *
 * FALSE POSITIVES. Title Case is house style at many American
 * publications and is correct there. A heading full of proper nouns ("History
 * of the New York City Subway") is capitalised because the words are names.
 * A level-1 title followed by a level-2 heading is how almost every document
 * starts, so level 1 is exempt from empty-section. People put emoji in README
 * headings on purpose. None of these is about authorship; they are about
 * whether a document looks like unedited chat output.
 */
import { SOURCES } from './lexicon.mjs';
import { HEADING_RE, THEMATIC_RE } from '../document.mjs';
import { inOrder } from './util.mjs';

const SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'nor', 'for', 'of', 'in', 'on', 'at', 'to', 'by', 'with', 'from', 'as', 'vs', 'via']);
const EMOJI_LEAD = /^(\s*(?:(?:[-*+]|\d{1,9}[.)])\s+|#{1,6}\s+)?(?:\*\*|__)?)(\p{Extended_Pictographic}(?:\u{fe0f}|\u{200d}\p{Extended_Pictographic})*)/u;

function detect(doc) {
  const found = [];
  const headings = [];

  for (let n = 1; n <= doc.lines.length; n++) {
    const line = doc.lineText(n, 'structure');
    const start = doc.lines[n - 1].start;

    const emoji = EMOJI_LEAD.exec(line);
    if (emoji && !/^\p{N}$/u.test(emoji[2])) found.push(doc.finding(start + emoji[1].length, emoji[2].length, 'emoji-marker'));

    if (doc.kinds[n - 1] !== 'heading') continue;
    const marker = HEADING_RE.exec(line);
    const level = marker[1].length;
    const lead = marker[0].length;
    const title = line.slice(lead).replace(/\s+#+\s*$/, '').trimEnd();
    headings.push({ n, level, offset: start + lead, title });

    const words = title.replace(/[*_`]/g, '').match(/[\p{L}][\p{L}\p{M}'\u{2019}-]*/gu) || [];
    const later = words.slice(1).filter((w) => !SMALL_WORDS.has(w.toLowerCase()));
    const capitalised = later.filter((w) => /^\p{Lu}\p{Ll}/u.test(w));
    if (capitalised.length >= 3 && capitalised.length === later.length && title.length) {
      found.push(doc.finding(start + lead, title.length, 'title-case'));
    }
  }

  headings.forEach((h, i) => {
    const next = headings[i + 1];
    if (!next) return;
    if (next.level - h.level > 1) found.push(doc.finding(next.offset, next.title.length, `skipped-level: h${h.level} to h${next.level}`));
    if (h.level >= 2 && next.level > h.level) {
      let body = false;
      for (let n = h.n + 1; n < next.n; n++) {
        if (doc.kinds[n - 1] !== 'blank' && /\S/.test(doc.lineText(n, 'structure'))) { body = true; break; }
      }
      if (!body) found.push(doc.finding(h.offset, h.title.length, 'empty-section'));
    }
  });

  for (let n = 1; n <= doc.lines.length; n++) {
    if (doc.kinds[n - 1] !== 'break') continue;
    const line = doc.lineText(n, 'structure');
    if (!THEMATIC_RE.test(line)) continue;
    let k = n + 1;
    while (k <= doc.lines.length && doc.kinds[k - 1] === 'blank') k++;
    if (k <= doc.lines.length && doc.kinds[k - 1] === 'heading') {
      const lead = line.length - line.trimStart().length;
      found.push(doc.finding(doc.lines[n - 1].start + lead, line.trim().length, 'thematic-break'));
    }
  }
  return inOrder(found);
}

export default {
  id: 'heading-style',
  name: 'Heading and section style',
  category: 'formatting',
  weight: 'weak',
  description:
    'Counts five formatting habits: Title Case headings (3 or more capitalised words after the first, with every non-trivial word capitalised), a heading with no body before a deeper heading, skipped heading levels, a thematic break placed directly before a heading, and an emoji opening a heading, list item or line. False positive: Title Case is house style at many publications, headings made of proper nouns are capitalised because the words are names, and people put emoji in README headings on purpose. These are signs of unedited chat formatting, not of authorship.',
  source: [SOURCES.wikipedia],
  baseline: null,
  historical: false,
  detect,
};
