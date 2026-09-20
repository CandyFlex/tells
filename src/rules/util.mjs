/**
 * util.mjs: the few helpers every rule shares.
 *
 * Phrases in the lexicon are written the way a person would type them
 * ("serves as", "it's"). `phraseRegex` turns a list of them into one regular
 * expression that also matches the two things real documents do to a phrase:
 * wrap it across a line break (hard-wrapped Markdown) and use a typographic
 * apostrophe. A phrase never matches across a blank line, because that is a
 * paragraph boundary.
 */

import { SOURCES } from './lexicon.mjs';

/** Whitespace inside a phrase: spaces, or one line break. Never a blank line. */
const GAP = '(?:[ \\t]+|[ \\t]*\\n[ \\t]*(?!\\n))';
const APOSTROPHE = "['\\u{2019}]";

export function phraseSource(phrase) {
  return phrase.replace(/ /g, GAP).replace(/'/g, APOSTROPHE);
}

/**
 * One regex for a list of phrases: whole-phrase, case-insensitive, global.
 * Alternatives are tried in list order, so put the longest first.
 */
export function phraseRegex(phrases, { prefix = '', suffix = '', flags = 'giu' } = {}) {
  const body = phrases.map(phraseSource).join('|');
  return new RegExp(`${prefix}(?<![\\p{L}\\p{N}_-])(?:${body})(?![\\p{L}\\p{N}_])${suffix}`, flags);
}

export const WIKIPEDIA = SOURCES.wikipedia;

/** Sort findings into document order and drop any that overlap an earlier one. */
export function withoutOverlaps(findings) {
  const sorted = [...findings].sort((a, b) => a.offset - b.offset || b.length - a.length);
  const out = [];
  let end = -1;
  for (const f of sorted) {
    if (f.offset < end) continue;
    out.push(f);
    end = f.offset + f.length;
  }
  return out;
}

/** Where findings overlap, keep the longest (the fullest statement of the pattern), then return document order. */
export function preferLongest(findings) {
  const kept = [];
  for (const f of [...findings].sort((a, b) => b.length - a.length || a.offset - b.offset)) {
    if (!kept.some((k) => f.offset < k.offset + k.length && k.offset < f.offset + f.length)) kept.push(f);
  }
  return kept.sort((a, b) => a.offset - b.offset);
}

export const inOrder = (findings) => [...findings].sort((a, b) => a.offset - b.offset || a.length - b.length);

/**
 * Is this offset inside a quotation in its sentence? Quoted words belong to
 * whoever is being quoted. Straight quotes are paired by counting; curly
 * quotes by the nearest opener.
 */
export function insideQuotation(doc, offset) {
  const s = doc.sentenceAt(offset);
  if (!s) return false;
  const before = doc.text.slice(s.start, offset);
  const open = before.lastIndexOf('\u{201c}');
  const close = before.lastIndexOf('\u{201d}');
  if (open > close) return true;
  const straight = (before.match(/"/g) || []).length;
  return straight % 2 === 1;
}

/** Skip Markdown emphasis and quote marks at the start of a sentence. */
export function sentenceOpening(doc, sentence) {
  const lead = /^[\s*_"'\u{201c}\u{2018}(\[]*/u.exec(doc.text.slice(sentence.start, sentence.end))[0].length;
  return sentence.start + lead;
}
