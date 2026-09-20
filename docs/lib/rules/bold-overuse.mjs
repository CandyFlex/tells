/**
 * bold-overuse: how much of the document is shouting.
 *
 * Every bold span (**text** or __text__) is a finding, so the density per
 * 1,000 words is auditable span by span. A paragraph holding 3 or more bold
 * spans gets one extra finding marked `aggregate: true` that covers the run
 * from its first span to its last; aggregates are not added to the count.
 *
 * Formatting rule: reads the structure view, so a "**" inside a code fence
 * or inline code is not bold.
 *
 * FALSE POSITIVES. Documentation bolds UI labels ("click **Save**") and
 * warnings, and it should. Study notes and legal summaries bold defined
 * terms. One bold span is one bold span; the density and the per-paragraph
 * pile-ups are the measurement.
 */
import { SOURCES } from './lexicon.mjs';
import { inOrder } from './util.mjs';

const BOLD = /(\*\*|__)(?=\S)[^\n]*?\S\1/gu;
const PILE_UP = 3;

function blocks(doc) {
  // Blank-line separated blocks of the structure view (a list is one block).
  const out = [];
  let start = null;
  for (let n = 1; n <= doc.lines.length; n++) {
    const blank = doc.kinds[n - 1] === 'blank';
    if (!blank && start === null) start = doc.lines[n - 1].start;
    if ((blank || n === doc.lines.length) && start !== null) {
      out.push({ start, end: blank ? doc.lines[n - 1].start : doc.lines[n - 1].end });
      start = null;
    }
  }
  return out;
}

function detect(doc) {
  const spans = doc.findAll(BOLD, { view: 'structure' });
  const piles = [];
  for (const b of blocks(doc)) {
    const inside = spans.filter((s) => s.offset >= b.start && s.offset < b.end);
    if (inside.length >= PILE_UP) {
      const first = inside[0];
      const last = inside[inside.length - 1];
      piles.push(doc.finding(first.offset, last.offset + last.length - first.offset, `${inside.length} bold spans in one paragraph`, { aggregate: true }));
    }
  }
  return inOrder([...spans, ...piles]);
}

function detail(doc, findings) {
  return { boldSpans: findings.filter((f) => !f.aggregate).length, paragraphsWithThreeOrMore: findings.filter((f) => f.aggregate).length };
}

export default {
  id: 'bold-overuse',
  name: 'Bold overuse',
  category: 'formatting',
  weight: 'weak',
  description:
    'Counts bold spans per 1,000 words and marks any paragraph or list holding 3 or more. False positive: documentation bolds UI labels and warnings, and study notes and legal summaries bold defined terms, all correctly. One bold span means nothing; the density and the per-paragraph pile-ups are the measurement.',
  source: [SOURCES.wikipedia],
  baseline: null,
  historical: false,
  detect,
  detail,
};
