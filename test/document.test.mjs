/**
 * Tests for the document model: offsets that never move, masking that is
 * real, and a sentence splitter that prefers joining to cutting.
 *
 * The masking cases began as regressions from the first real run, where a
 * technical README measured 14.7 em dashes per 1,000 words and eight of the
 * fourteen were inside code fences and table cells.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { parseDocument, per1k } from '../src/document.mjs';
import { describe, STATS_LABEL, TTR_WINDOW } from '../src/stats.mjs';
import { sha256 } from '../src/sha256.mjs';

const DASH = '\u{2014}';

/* ---------------- offsets ---------------- */

test('every view has the same length and the same line count as the input', () => {
  const src = ['---', 'title: x', '---', '', 'Prose `code` here.', '', '```js', 'const a = 1;', '```', '', '> quoted', '', 'See https://example.com/a-b now.'].join('\n');
  const doc = parseDocument(src);
  assert.equal(doc.structure.length, doc.raw.length);
  assert.equal(doc.text.length, doc.raw.length);
  assert.equal(doc.text.split('\n').length, doc.raw.split('\n').length);
});

test('CRLF input is normalised and lines still point at the right place', () => {
  const doc = parseDocument('one\r\ntwo delve\r\nthree');
  assert.equal(doc.raw, 'one\ntwo delve\nthree');
  const at = doc.raw.indexOf('delve');
  assert.deepEqual(doc.locate(at), { line: 2, col: 5 });
  assert.equal(doc.offsetOf(2, 5), at);
});

test('columns are UTF-16 code units and that is what slice uses', () => {
  const doc = parseDocument('A \u{1F600} pivotal moment.');
  const at = doc.raw.indexOf('pivotal');
  const { line, col } = doc.locate(at);
  assert.equal(line, 1);
  assert.equal(col, 6, 'the emoji occupies two code units');
  const f = doc.finding(at, 7);
  assert.equal(doc.raw.slice(doc.offsetOf(f.line, f.col), doc.offsetOf(f.line, f.col) + f.length), 'pivotal');
});

/* ---------------- masking ---------------- */

test('fenced code is masked in both views and keeps its line numbers', () => {
  const doc = parseDocument(['Real prose here.', '```js', `const x = 'delve ${DASH} tapestry';`, '```', 'More prose.'].join('\n'));
  assert.ok(!doc.text.includes('delve'));
  assert.ok(!doc.structure.includes('delve'));
  assert.ok(doc.text.includes('Real prose here.'));
  assert.ok(doc.text.includes('More prose.'));
  assert.equal(doc.counts.emDashes, 0);
  assert.equal(doc.locate(doc.raw.indexOf('More')).line, 5);
});

test('an unclosed fence masks to the end rather than leaking code into prose', () => {
  const doc = parseDocument('Intro.\n\n```\ndelve into the tapestry\nstill code');
  assert.ok(!doc.text.includes('delve'));
});

test('tilde fences, longer fences and indented code are masked', () => {
  const doc = parseDocument(['Intro.', '', '~~~', 'delve', '~~~', '', '````md', '```', 'tapestry', '```', '````', '', '    pivotal = true', '', 'Outro.'].join('\n'));
  for (const w of ['delve', 'tapestry', 'pivotal']) assert.ok(!doc.text.includes(w), `${w} should be masked`);
  assert.ok(doc.text.includes('Outro.'));
});

test('an indented continuation of a list item is prose, not code', () => {
  const doc = parseDocument(['- first item', '', '    continuation that is pivotal', '', 'After.'].join('\n'));
  assert.ok(doc.text.includes('pivotal'));
});

test('inline code, URLs, link targets, HTML tags, front matter and blockquotes are masked', () => {
  const src = [
    '---', 'title: a vibrant tapestry', '---', '',
    `Use \`delve ${DASH} x\` and see [the pivotal docs](https://example.com/crucial-guide "A testament") today.`,
    '', '<span class="showcase">Visible words</span> stay.', '',
    '> The committee will delve into the matter.', '',
    `Bare link: https://example.com/intricate${DASH}path. Next sentence.`,
    '', '[ref]: https://example.com/landscape',
  ].join('\n');
  const doc = parseDocument(src);
  for (const w of ['vibrant', 'tapestry', 'delve', 'crucial', 'testament', 'showcase', 'intricate', 'landscape']) {
    assert.ok(!doc.text.includes(w), `${w} should be masked`);
  }
  assert.ok(doc.text.includes('pivotal docs'), 'a link label is prose');
  assert.ok(doc.text.includes('Visible words'), 'text between tags is prose');
  assert.ok(doc.text.includes('. Next sentence.'), 'the period after a URL survives');
  assert.equal(doc.counts.emDashes, 0);
  const kinds = new Set(doc.masks.map((m) => m.kind));
  for (const k of ['front-matter', 'inline-code', 'link-target', 'url', 'html-tag', 'blockquote', 'link-definition']) {
    assert.ok(kinds.has(k), `expected a ${k} mask`);
  }
});

test('a blockquote is masked for prose rules but visible to formatting rules', () => {
  const doc = parseDocument('> ## Quoted Heading\n\nBody.');
  assert.ok(!doc.text.includes('Quoted'));
  assert.ok(doc.structure.includes('Quoted'));
});

test('plain mode leaves Markdown alone but still masks URLs', () => {
  const doc = parseDocument(`\`delve\` ${DASH} see https://example.com/a${DASH}b now`, { plain: true });
  assert.ok(doc.text.includes('delve'));
  assert.equal(doc.counts.emDashes, 1, 'the dash in the URL is not writing');
});

test('a thematic break in the body is not mistaken for front matter', () => {
  const doc = parseDocument('Intro paragraph.\n\n---\n\nA pivotal section.\n\n---\n\nEnd.');
  assert.ok(doc.text.includes('pivotal'));
});

/* ---------------- segmentation ---------------- */

const sentencesOf = (src) => {
  const doc = parseDocument(src);
  return doc.proseSentences.map((s) => doc.raw.slice(s.start, s.end));
};

test('sentences split on terminal punctuation followed by a capital', () => {
  assert.deepEqual(sentencesOf('It rained. We stayed in! Did you? Yes.'), ['It rained.', 'We stayed in!', 'Did you?', 'Yes.']);
});

test('abbreviations, initials and decimals do not end a sentence', () => {
  assert.deepEqual(
    sentencesOf('Dr. Smith met Mr. Jones, e.g. on Tuesday. See No. 10 vs. No. 51. It cost 3.14 dollars. J. R. Tolkien wrote it.'),
    ['Dr. Smith met Mr. Jones, e.g. on Tuesday.', 'See No. 10 vs. No. 51.', 'It cost 3.14 dollars.', 'J. R. Tolkien wrote it.'],
  );
});

test('a lowercase continuation is not a new sentence', () => {
  assert.deepEqual(sentencesOf('He said "stop." and then left. Done.'), ['He said "stop." and then left.', 'Done.']);
});

test('headings, list items and paragraphs are separate units', () => {
  const doc = parseDocument(['# A Heading', 'First para sentence one. Sentence two.', '', '- item one', '- item two. With more.', '', 'Last para.'].join('\n'));
  assert.equal(doc.counts.headings, 1);
  assert.equal(doc.counts.listItems, 2);
  assert.equal(doc.counts.sentences, 6, 'heading is not a prose sentence');
  assert.equal(doc.counts.paragraphs, 3);
  assert.equal(doc.sentences[0].kind, 'heading');
  assert.equal(doc.raw.slice(doc.sentences[0].start, doc.sentences[0].end), 'A Heading');
});

test('words follow the stated pattern: letters, marks, apostrophes, hyphens', () => {
  const doc = parseDocument('The state-of-the-art caf\u{e9} isn\u{2019}t open at 9 or 10.');
  assert.deepEqual(doc.words.map((w) => w.text), ['The', 'state-of-the-art', 'caf\u{e9}', 'isn\u{2019}t', 'open', 'at', 'or']);
});

test('counts cover the punctuation the report promises', () => {
  const doc = parseDocument(`Why? Because; here: a ${DASH} b \u{2013} c. **Bold** and __bold__.`);
  assert.equal(doc.counts.questions, 1);
  assert.equal(doc.counts.semicolons, 1);
  assert.equal(doc.counts.colons, 1);
  assert.equal(doc.counts.emDashes, 1);
  assert.equal(doc.counts.enDashes, 1);
  assert.equal(doc.counts.boldSpans, 2);
});

test('excerpts are the surrounding sentence and never longer than 160 characters plus ellipses', () => {
  const long = `Then ${'word '.repeat(60)}pivotal ${'word '.repeat(60)}end.`;
  const doc = parseDocument(`Short one. ${long}`);
  const f = doc.finding(doc.raw.indexOf('pivotal'), 7);
  assert.ok(f.excerpt.includes('pivotal'));
  assert.ok(f.excerpt.length <= 166, `got ${f.excerpt.length}`);
  const g = doc.finding(0, 5);
  assert.equal(g.excerpt, 'Short one.');
});

test('per1k is two-decimal and safe on an empty document', () => {
  assert.equal(per1k(3, 1000), 3);
  assert.equal(per1k(1, 3), 333.33);
  assert.equal(per1k(5, 0), 0);
  const doc = parseDocument('');
  assert.equal(doc.counts.words, 0);
  assert.equal(doc.counts.lines, 1);
});

/* ---------------- statistics ---------------- */

test('statistics are computed from the segmentation and carry their label', () => {
  const doc = parseDocument('One two three. One two three four five. Another one here.\n\nSecond paragraph stands alone.');
  const s = describe(doc);
  assert.equal(s.label, STATS_LABEL);
  assert.match(s.label, /abandoned perplexity and burstiness/);
  assert.equal(s.sentenceLength.n, 4);
  assert.equal(s.sentenceLength.mean, 3.75);
  assert.equal(s.paragraphLength.mean, 2);
  assert.equal(s.repeatedOpeners.count, 1);
  assert.equal(s.repeatedOpeners.of, 3);
  assert.equal(s.longestSentence.words, 5);
  assert.deepEqual([s.longestSentence.line, s.longestSentence.col], [1, 16]);
  assert.equal(s.shortestSentence.words, 3);
  assert.equal(s.typeTokenRatio.window, TTR_WINDOW);
  assert.match(s.typeTokenRatio.note, /fewer than 500/);
});

test('type-token ratio uses only the first 500 words', () => {
  const abc = 'abcdefghij';
  const head = Array.from({ length: 500 }, (_, i) => `w${abc[i % 10]}${abc[Math.floor(i / 10) % 10]}x`).join(' ');
  const a = describe(parseDocument(`${head}.`));
  const b = describe(parseDocument(`${head} ${'zzz '.repeat(400)}.`));
  assert.equal(a.typeTokenRatio.value, b.typeTokenRatio.value);
  assert.equal(b.typeTokenRatio.tokens, 500);
});

test('statistics carry no judgement keys', () => {
  const s = describe(parseDocument('A sentence here. Another sentence there.'));
  assert.doesNotMatch(JSON.stringify(Object.keys(s)), /score|probab|verdict|likelihood|confidence|baseline|above/i);
});

/* ---------------- hashing ---------------- */

test('sha256 matches the published vectors and node:crypto', () => {
  assert.equal(sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for (const s of ['x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(1000), `caf\u{e9} ${DASH} \u{1F600} \u{3010} 1 \u{3011}`]) {
    assert.equal(sha256(s), createHash('sha256').update(s, 'utf8').digest('hex'), `length ${s.length}`);
  }
});
