/**
 * chat-residue: the model talking to the person who prompted it.
 *
 * "I hope this helps", "Would you like me to", "As of my last knowledge
 * update". These are sentences addressed to a chat user that were pasted
 * into a document along with the answer. This is one of two rules weighted
 * strong, because the text is not a style: it is the other half of a
 * conversation, left in.
 *
 * Three position constraints keep ordinary speech out:
 *   - "Certainly!", "Sure!" count only at the start of a line
 *   - "Here's a" / "Here is a" count only as the first words of the document
 *   - everything is skipped inside a quotation or a blockquote
 *
 * FALSE POSITIVES. Emails and support replies written by people say "let
 * me know if" and "feel free to" all day, and a transcript of a chat session
 * is supposed to contain this. Strong means a single hit deserves to be read,
 * not that it settles anything: read the sentence.
 */
import { CHAT_RESIDUE, CHAT_LINE_OPENERS, CHAT_DOCUMENT_OPENERS, SOURCES } from './lexicon.mjs';
import { phraseSource, withoutOverlaps, insideQuotation } from './util.mjs';

const BOUNDED = (source) => `(?<![\\p{L}\\p{N}_-])(?:${source})(?![\\p{L}\\p{N}_])`;
const PHRASES = CHAT_RESIDUE.map((r) => ({ note: r.note, re: new RegExp(BOUNDED(phraseSource(r.pattern)), 'giu') }));
const LINE_OPENERS = new RegExp(`^[ \\t>*_-]*(${CHAT_LINE_OPENERS.join('|')})`, 'gmu');
const DOC_OPENER = new RegExp(`^[\\s*_#>-]*(${CHAT_DOCUMENT_OPENERS.map(phraseSource).join('|')})(?![\\p{L}])`, 'iu');

function detect(doc) {
  const found = [];
  const quoted = (m, offset) => !insideQuotation(doc, offset);
  for (const { note, re } of PHRASES) found.push(...doc.findAll(re, { note, filter: quoted }));
  found.push(...doc.findAll(LINE_OPENERS, { group: 1, note: 'assistant opener', filter: quoted }));

  const m = DOC_OPENER.exec(doc.text);
  if (m) {
    const offset = m.index + m[0].length - m[1].length;
    found.push(doc.finding(offset, m[1].length, 'assistant opener at document start'));
  }
  return withoutOverlaps(found);
}

export default {
  id: 'chat-residue',
  name: 'Chat residue',
  category: 'artifact',
  weight: 'strong',
  description:
    'Finds sentences addressed to a chat user that were pasted in with the answer: As an AI, as of my knowledge cutoff, I hope this helps, let me know if, would you like me to, I would be happy to help, just say the word, great question, I cannot help with, feel free to, I do not have access to real-time, "Certainly!" or "Sure!" at the start of a line, and "Here is a" or "Below is a" as the first words of the document. Quotations and blockquotes are skipped. False positive: emails and support replies written by people say "let me know if" and "feel free to" constantly, and a chat transcript is supposed to contain all of this. Strong means a single hit deserves reading, not that it settles anything.',
  source: [SOURCES.wikipedia],
  baseline: null,
  historical: false,
  detect,
};
