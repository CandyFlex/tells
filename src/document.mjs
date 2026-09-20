/**
 * document.mjs: turn a string into something rules can measure without lying
 * about where they found it.
 *
 * TWO PROMISES, AND EVERYTHING ELSE FOLLOWS FROM THEM.
 *
 *   1. OFFSETS NEVER MOVE. Masking replaces characters with spaces of equal
 *      length. Nothing is deleted, so an offset in the masked view is the same
 *      offset in the text the writer gave us, and every finding can be checked
 *      with `raw.slice(offset, offset + length) === match`. The audit does
 *      exactly that.
 *
 *   2. CODE IS NOT PROSE. The first real run of the starter version of this
 *      tool measured a technical README at 14.7 em dashes per 1,000 words.
 *      Five of the fourteen were inside fenced code and three were table
 *      cells. A linter that flags a developer for the contents of their own
 *      code samples is making the mistake this project exists to describe:
 *      keying on a surface feature that has nothing to do with the question.
 *
 * Three views of the same text, all the same length:
 *
 *   raw        line endings normalised to \n, otherwise untouched
 *   structure  raw with code, front matter and HTML comments blanked.
 *              Formatting rules read this: a "**" inside a code fence is not
 *              bold, but a heading inside a blockquote is still a heading.
 *   text       structure with inline code, URLs, link targets, HTML tags and
 *              blockquotes blanked as well. Vocabulary, punctuation,
 *              structure and attribution rules read this. A quotation is
 *              somebody else's prose, so it is not counted against the writer.
 *
 * `plain: true` turns the Markdown handling off. URLs are still masked in
 * plain mode, because a hyphenated slug is not writing in any format.
 *
 * Columns are 1-based and counted in UTF-16 code units (what JavaScript,
 * VS Code and the SARIF default all use). An astral character is two columns.
 *
 * KNOWN LIMITS. This is a line scanner, not a CommonMark parser. Lazy
 * blockquote continuation lines are not recognised as quoted. An indented
 * block is treated as code only when it follows a blank line and does not
 * continue a list. Setext headings (underlined with === or ---) are not
 * recognised as headings.
 */

/** Abbreviations that end in a period without ending a sentence. */
export const ABBREVIATIONS = [
  'e.g.', 'i.e.', 'mr.', 'mrs.', 'ms.', 'dr.', 'vs.', 'etc.', 'no.', 'st.',
  'jr.', 'sr.', 'prof.', 'cf.', 'fig.', 'inc.', 'co.', 'ltd.', 'vol.', 'pp.',
];

const WORD_RE = /\p{L}[\p{L}\p{M}'\u{2019}-]*/gu;

const blankOut = (s) => s.replace(/[^\n]/g, ' ');

function applyRanges(text, ranges) {
  if (!ranges.length) return text;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let out = '';
  let at = 0;
  for (const r of sorted) {
    if (r.end <= at) continue;
    const start = Math.max(r.start, at);
    out += text.slice(at, start) + blankOut(text.slice(start, r.end));
    at = r.end;
  }
  return out + text.slice(at);
}

/** Line table: start and end offset of every line (end excludes the \n). */
function lineTable(raw) {
  const lines = [];
  let start = 0;
  for (let i = 0; i <= raw.length; i++) {
    if (i === raw.length || raw[i] === '\n') {
      lines.push({ start, end: i });
      start = i + 1;
    }
  }
  return lines;
}

export const LIST_ITEM_RE = /^\s*(?:[-*+]|\d{1,9}[.)])\s+/;
export const HEADING_RE = /^ {0,3}(#{1,6})(?:\s+|$)/;
export const THEMATIC_RE = /^ {0,3}(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;

/** Block-level masks, found by walking lines. */
function blockMasks(raw, lines) {
  const code = []; // blanked in `structure` and `text`
  const quote = []; // blanked in `text` only
  let i = 0;

  // Front matter: only at the very top, only when closed.
  if (lines.length > 1 && raw.slice(lines[0].start, lines[0].end).trim() === '---') {
    for (let j = 1; j < lines.length; j++) {
      const t = raw.slice(lines[j].start, lines[j].end).trim();
      if (t === '---' || t === '...') {
        code.push({ start: lines[0].start, end: lines[j].end, kind: 'front-matter' });
        i = j + 1;
        break;
      }
    }
  }

  let prevBlank = true;
  let inList = false;
  while (i < lines.length) {
    const line = raw.slice(lines[i].start, lines[i].end);
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const ch = fence[1][0];
      const len = fence[1].length;
      let j = i + 1;
      const close = new RegExp(`^ {0,3}\\${ch}{${len},}\\s*$`);
      while (j < lines.length && !close.test(raw.slice(lines[j].start, lines[j].end))) j++;
      const last = Math.min(j, lines.length - 1);
      code.push({ start: lines[i].start, end: lines[last].end, kind: 'fenced-code' });
      i = last + 1;
      prevBlank = false;
      continue;
    }
    if (line.trim() === '') {
      prevBlank = true;
      i++;
      continue;
    }
    if (prevBlank && !inList && /^(?: {4}|\t)/.test(line)) {
      let j = i;
      let last = i;
      while (j < lines.length) {
        const l = raw.slice(lines[j].start, lines[j].end);
        if (l.trim() === '') { j++; continue; }
        if (!/^(?: {4}|\t)/.test(l)) break;
        last = j;
        j++;
      }
      code.push({ start: lines[i].start, end: lines[last].end, kind: 'indented-code' });
      i = last + 1;
      prevBlank = true;
      continue;
    }
    if (/^ {0,3}>/.test(line)) quote.push({ start: lines[i].start, end: lines[i].end, kind: 'blockquote' });
    if (LIST_ITEM_RE.test(line)) inList = true;
    else if (prevBlank && !/^\s/.test(line)) inList = false;
    prevBlank = false;
    i++;
  }
  return { code, quote };
}

function collect(text, re, kind, pick) {
  const out = [];
  for (const m of text.matchAll(re)) {
    const r = pick ? pick(m) : { start: m.index, end: m.index + m[0].length };
    if (r && r.end > r.start) out.push({ ...r, kind });
  }
  return out;
}

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/g;

/** A URL ends before trailing sentence punctuation and unbalanced closers. */
function trimUrl(m) {
  let url = m[0];
  while (/[.,;:!?'"*_]$/.test(url) || (url.endsWith(')') && !url.includes('('))) url = url.slice(0, -1);
  return { start: m.index, end: m.index + url.length };
}

function buildViews(raw, lines, plain) {
  if (plain) {
    const masks = collect(raw, URL_RE, 'url', trimUrl);
    return { structure: raw, text: applyRanges(raw, masks), masks };
  }
  const { code, quote } = blockMasks(raw, lines);
  let work = applyRanges(raw, code);

  const comments = collect(work, /<!--[\s\S]*?-->/g, 'html-comment');
  work = applyRanges(work, comments);

  // Inline code: a run of backticks closed by the same run, inside one paragraph.
  const inline = collect(work, /(?<!`)(`+)(?!`)((?:[^\n]|\n(?![ \t]*\n))*?[^`])\1(?!`)/g, 'inline-code');
  work = applyRanges(work, inline);
  const structure = work;

  const masks = [...code, ...comments, ...inline, ...quote];
  work = applyRanges(work, quote);

  // [label](target "title"): the target is an address, the label is prose.
  const targets = collect(work, /\]\(([^()\s]*(?:\([^()\s]*\)[^()\s]*)*(?:\s+"[^"\n]*")?)\)/g, 'link-target', (m) => ({
    start: m.index + 2,
    end: m.index + 2 + m[1].length,
  }));
  const refDefs = collect(work, /^ {0,3}\[[^\]\n]+\]:[ \t]+\S.*$/gm, 'link-definition');
  work = applyRanges(work, [...targets, ...refDefs]);

  const urls = collect(work, URL_RE, 'url', trimUrl);
  work = applyRanges(work, urls);

  const tags = collect(work, /<\/?[A-Za-z][^<>\n]*>/g, 'html-tag');
  work = applyRanges(work, tags);

  masks.push(...targets, ...refDefs, ...urls, ...tags);
  masks.sort((a, b) => a.start - b.start);
  return { structure, text: work, masks };
}

/** What kind of line is this, structurally? Read from the `structure` view. */
function lineKind(s) {
  if (s.trim() === '') return 'blank';
  if (HEADING_RE.test(s)) return 'heading';
  if (THEMATIC_RE.test(s)) return 'break';
  if (TABLE_ROW_RE.test(s)) return 'table';
  if (LIST_ITEM_RE.test(s)) return 'list';
  return 'prose';
}

function endsWithAbbreviation(text, periodIndex) {
  let s = periodIndex;
  while (s > 0 && !/\s/.test(text[s - 1])) s--;
  const token = text.slice(s, periodIndex + 1).replace(/^[("'\u{201c}\u{2018}[*_]+/u, '');
  if (ABBREVIATIONS.includes(token.toLowerCase())) return true;
  return /^(?:\p{Lu}\.)+$/u.test(token); // initials: "J." or "U.S."
}

/**
 * Conservative sentence splitter over one unit of text. It would rather join
 * two sentences than cut one in half, because a cut sentence produces a wrong
 * excerpt and a wrong "closes the sentence" judgement.
 */
function splitSentences(text, start, end, kind, out) {
  const stop = /[.!?]+["'\u{201d}\u{2019})\]*_]*/gu;
  stop.lastIndex = start;
  let from = start;
  const push = (s, e) => {
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    if (e > s && /\p{L}/u.test(text.slice(s, e))) out.push({ start: s, end: e, kind });
  };
  let m;
  while ((m = stop.exec(text)) && m.index < end) {
    const after = m.index + m[0].length;
    if (after >= end) break;
    if (!/\s/.test(text[after])) continue; // "3.14", "example.com", "e.g.,"
    let next = after;
    while (next < end && /\s/.test(text[next])) next++;
    if (next >= end) break;
    const ahead = text.slice(next, next + 4).replace(/^["'\u{201c}\u{2018}([*_]+/u, '');
    if (!/^[\p{Lu}\p{N}]/u.test(ahead)) continue;
    if (m[0][0] === '.' && endsWithAbbreviation(text, m.index)) continue;
    push(from, after);
    from = after;
  }
  push(from, end);
}

function segment(structure, text, lines) {
  const kinds = lines.map((l) => lineKind(structure.slice(l.start, l.end)));
  const hasText = lines.map((l) => /\S/.test(text.slice(l.start, l.end)));
  const sentences = [];
  const paragraphs = [];

  let i = 0;
  while (i < lines.length) {
    if (kinds[i] === 'blank' || !hasText[i]) { i++; continue; }
    // A block: consecutive lines that still carry text after masking.
    let j = i;
    while (j < lines.length && kinds[j] !== 'blank' && hasText[j]) j++;
    const block = { start: lines[i].start, end: lines[j - 1].end, firstLine: i + 1, lastLine: j, sentences: 0 };

    // Units inside the block: a heading, table row or break line stands
    // alone; a list item runs until the next item; prose lines join.
    let k = i;
    while (k < j) {
      const kind = kinds[k];
      let e = k + 1;
      if (kind === 'prose' || kind === 'list') {
        while (e < j && kinds[e] === 'prose') e++;
      }
      if (kind !== 'break') {
        const before = sentences.length;
        if (kind === 'heading' || kind === 'table') {
          const s = lines[k].start;
          const t = text.slice(s, lines[k].end);
          const lead = t.length - t.replace(/^[\s#|]+/, '').length;
          const trail = t.length - t.replace(/[\s#|]+$/, '').length;
          if (/\p{L}/u.test(t)) sentences.push({ start: s + lead, end: lines[k].end - trail, kind });
        } else {
          let s = lines[k].start;
          if (kind === 'list') s += LIST_ITEM_RE.exec(structure.slice(s, lines[k].end))[0].length;
          splitSentences(text, s, lines[e - 1].end, kind, sentences);
        }
        if (kind === 'prose' || kind === 'list') block.sentences += sentences.length - before;
      }
      k = e;
    }
    if (block.sentences > 0) paragraphs.push(block);
    i = j;
  }
  return { sentences, paragraphs, kinds };
}

/**
 * Parse a document.
 *
 * @param {string} input
 * @param {object} [opts]
 * @param {boolean} [opts.plain=false]  turn Markdown-aware masking off
 */
export function parseDocument(input, { plain = false } = {}) {
  if (typeof input !== 'string') throw new Error('parseDocument: input must be a string');
  let raw = input.replace(/\r\n?/g, '\n');
  if (raw.charCodeAt(0) === 0xfeff) raw = ' ' + raw.slice(1); // BOM: keep the length, lose the character

  const lines = lineTable(raw);
  const { structure, text, masks } = buildViews(raw, lines, plain);
  const { sentences, paragraphs, kinds } = segment(structure, text, lines);

  const words = [];
  for (const m of text.matchAll(WORD_RE)) words.push({ start: m.index, end: m.index + m[0].length, text: m[0] });

  // Words per sentence, in one pass (both lists are in document order).
  let w = 0;
  for (const s of sentences) {
    while (w < words.length && words[w].start < s.start) w++;
    let n = 0;
    let v = w;
    while (v < words.length && words[v].start < s.end) { n++; v++; }
    s.words = n;
    s.firstWord = n ? words[w].text.toLowerCase() : null;
  }

  function locate(offset) {
    let lo = 0;
    let hi = lines.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lines[mid].start <= offset) lo = mid; else hi = mid - 1;
    }
    return { line: lo + 1, col: offset - lines[lo].start + 1 };
  }

  function offsetOf(line, col) {
    const l = lines[line - 1];
    return l ? l.start + col - 1 : -1;
  }

  function sentenceAt(offset) {
    let lo = 0;
    let hi = sentences.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const s = sentences[mid];
      if (offset < s.start) hi = mid - 1;
      else if (offset >= s.end) lo = mid + 1;
      else return s;
    }
    return null;
  }

  /** The sentence around a match, from the raw text, at most 160 characters. */
  function excerpt(offset, length) {
    const s = sentenceAt(offset);
    let from;
    let to;
    if (s) {
      from = s.start;
      to = Math.max(s.end, Math.min(offset + length, raw.length));
    } else {
      const p = locate(offset);
      from = lines[p.line - 1].start;
      to = Math.max(lines[p.line - 1].end, Math.min(offset + length, raw.length));
    }
    const MAX = 160;
    let cutStart = false;
    let cutEnd = false;
    if (to - from > MAX) {
      const room = Math.max(0, MAX - length);
      let newFrom = Math.max(from, offset - Math.floor(room / 2));
      let newTo = Math.min(to, newFrom + MAX);
      cutStart = newFrom > from;
      cutEnd = newTo < to;
      // Cut between words. A quotation that starts "...ne trail system" makes
      // the reader reconstruct the word before they can read the sentence.
      const wordChar = (i) => i >= 0 && i < raw.length && /[\p{L}\p{N}]/u.test(raw[i]);
      while (cutStart && newFrom < offset && wordChar(newFrom - 1) && wordChar(newFrom)) newFrom++;
      while (cutEnd && newTo > offset + length && wordChar(newTo - 1) && wordChar(newTo)) newTo--;
      from = newFrom;
      to = newTo;
    }
    const body = raw.slice(from, to).replace(/\s+/g, ' ').trim();
    return `${cutStart ? '...' : ''}${body}${cutEnd ? '...' : ''}`;
  }

  /** Build a finding. `match` is always the raw slice, so it is always locatable. */
  function finding(offset, length, note, extra) {
    const { line, col } = locate(offset);
    const f = { line, col, offset, length, match: raw.slice(offset, offset + length), excerpt: excerpt(offset, length) };
    if (note) f.note = note;
    return extra ? { ...f, ...extra } : f;
  }

  /** Findings for every match of a global regex over one view. */
  function findAll(re, { view = 'text', group = 0, note, filter, extra } = {}) {
    const source = view === 'raw' ? raw : view === 'structure' ? structure : text;
    const out = [];
    for (const m of source.matchAll(re)) {
      if (m[0].length === 0) continue;
      let offset = m.index;
      let length = m[0].length;
      if (group) {
        if (m[group] == null) continue;
        offset = m.index + m[0].indexOf(m[group]);
        length = m[group].length;
      }
      if (filter && !filter(m, offset)) continue;
      out.push(finding(offset, length, typeof note === 'function' ? note(m) : note, extra));
    }
    return out;
  }

  const count = (re, view = text) => (view.match(re) || []).length;
  const proseSentences = sentences.filter((s) => s.kind === 'prose' || s.kind === 'list');

  const counts = {
    words: words.length,
    sentences: proseSentences.length,
    paragraphs: paragraphs.length,
    lines: lines.length,
    chars: raw.length,
    headings: kinds.filter((k) => k === 'heading').length,
    listItems: kinds.filter((k) => k === 'list').length,
    boldSpans: count(/(\*\*|__)(?=\S)[^\n]*?\S\1/g, structure),
    emDashes: count(/\u{2014}/gu),
    enDashes: count(/\u{2013}/gu),
    semicolons: count(/;/g),
    colons: count(/:/g),
    questions: count(/\?/g),
  };

  const viewOf = (view) => (view === 'raw' ? raw : view === 'structure' ? structure : text);

  return {
    raw, structure, text, plain, lines, kinds, masks,
    sentences, proseSentences, paragraphs, words, counts,
    locate, offsetOf, sentenceAt, excerpt, finding, findAll,
    lineText: (n, view = 'raw') => viewOf(view).slice(lines[n - 1].start, lines[n - 1].end),
  };
}

/** Occurrences per 1,000 words, two decimals, 0 for an empty document. */
export function per1k(count, words) {
  return words > 0 ? Math.round((count / words) * 100000) / 100 : 0;
}
