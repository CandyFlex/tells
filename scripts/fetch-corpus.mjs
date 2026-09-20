/**
 * fetch-corpus.mjs: fetch the public-domain human texts and cut the passages.
 *
 *   node scripts/fetch-corpus.mjs                 fetch from the network
 *   node scripts/fetch-corpus.mjs --from <dir>    use already-downloaded files
 *                                                 (pg4.txt, pg119.txt, ..., shelby-parse.json)
 *
 * This is the only script in the repository that touches the network, and
 * nothing in `npm test` runs it. It exists so the corpus is reproducible: each
 * passage is defined by a URL, a start marker and a word budget, not by
 * someone's copy and paste.
 *
 * How a passage is cut: start at the marker, add whole paragraphs until the
 * passage reaches TARGET words, and never pass MAX. Text is kept exactly as
 * the source has it, including Project Gutenberg's hard line wraps and its
 * transcription of dashes (some files use the dash character, some use a
 * double hyphen). Nothing is corrected, because correcting the human rows of
 * a comparison table is how a comparison table gets rigged.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'corpus', 'human');
const UA = 'tells-corpus-build/0.1 (https://github.com/CandyFlex/tells)';
const TARGET = 1500;
const MAX = 2000;

export const SHELBY_OLDID = 931685620;

export const GUTENBERG = [
  { ebook: 4, out: 'lincoln-gettysburg-address.txt', start: 'Four score and seven years ago', whole: true },
  { ebook: 119, out: 'twain-awful-german-language.txt', start: 'I went often to look at the collection of curiosities' },
  { ebook: 1404, out: 'madison-federalist-10.txt', start: 'AMONG the numerous advantages promised by a well constructed Union' },
  { ebook: 205, out: 'thoreau-walden-economy.txt', start: 'When I wrote the following pages, or rather the bulk of them' },
  { ebook: 1228, out: 'darwin-origin-introduction.txt', start: 'When on board H.M.S.' },
];

export const gutenbergUrl = (n) => `https://www.gutenberg.org/cache/epub/${n}/pg${n}.txt`;
export const shelbyApiUrl = `https://en.wikipedia.org/w/api.php?action=parse&oldid=${SHELBY_OLDID}&prop=text&format=json&formatversion=2`;

const words = (s) => (s.match(/\p{L}[\p{L}\p{M}'\u{2019}-]*/gu) || []).length;

async function get(url, cacheFile, from) {
  if (from) {
    const p = join(from, cacheFile);
    if (!existsSync(p)) throw new Error(`--from: ${p} not found`);
    return readFileSync(p, 'utf8');
  }
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** Whole paragraphs from the marker until TARGET words, never past MAX. */
export function cutPassage(text, start, { whole = false } = {}) {
  const body = text.replace(/\r\n?/g, '\n');
  const at = body.indexOf(start);
  if (at === -1) throw new Error(`start marker not found: ${start}`);
  const end = body.indexOf('*** END OF THE PROJECT GUTENBERG', at);
  const paragraphs = body.slice(at, end === -1 ? undefined : end).split(/\n\s*\n/).map((p) => p.replace(/\s+$/, '')).filter((p) => p.trim());
  if (whole) return `${paragraphs.join('\n\n')}\n`;
  const kept = [];
  let n = 0;
  for (const p of paragraphs) {
    const w = words(p);
    if (n >= 800 && n + w > MAX) break;
    kept.push(p);
    n += w;
    if (n >= TARGET) break;
  }
  return `${kept.join('\n\n')}\n`;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '\u{2013}', mdash: '\u{2014}' };
const decode = (s) =>
  s.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name] ?? m);

/** Article prose from MediaWiki parser HTML: headings and paragraphs, in order. */
export function wikiHtmlToMarkdown(html, title) {
  let s = html;
  for (let i = 0; i < 8; i++) s = s.replace(/<table\b[^>]*>(?:(?!<table\b)[\s\S])*?<\/table>/gi, '');
  s = s.replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<sup\b[\s\S]*?<\/sup>/gi, '')
    .replace(/<span class="mw-editsection">[\s\S]*?<\/span>\s*<\/span>/gi, '')
    .replace(/<span class="mw-editsection[\s\S]*?\]<\/span><\/span>/gi, '');
  const out = [`# ${title}`];
  const STOP = /^(See also|References|External links|Notes|Further reading|Notable people)$/i;
  let n = 0;
  let skipping = false;
  for (const m of s.matchAll(/<(h2|h3|p)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = decode(m[2].replace(/<[^>]+>/g, '')).replace(/\[edit\]/g, '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (m[1].toLowerCase() !== 'p') {
      skipping = STOP.test(text);
      if (!skipping) out.push(`${m[1].toLowerCase() === 'h2' ? '##' : '###'} ${text}`);
      continue;
    }
    if (skipping) continue;
    out.push(text);
    n += words(text);
    if (n >= TARGET) break;
  }
  while (/^#/.test(out[out.length - 1])) out.pop(); // no heading left dangling at the cut
  return `${out.join('\n\n')}\n`;
}

async function main() {
  const i = process.argv.indexOf('--from');
  const from = i === -1 ? null : process.argv[i + 1];
  mkdirSync(OUT, { recursive: true });
  for (const g of GUTENBERG) {
    const text = await get(gutenbergUrl(g.ebook), `pg${g.ebook}.txt`, from);
    const passage = cutPassage(text, g.start, g);
    writeFileSync(join(OUT, g.out), passage);
    console.log(`${g.out}  ${words(passage)} words  from ${gutenbergUrl(g.ebook)}`);
  }
  const parsed = JSON.parse(await get(shelbyApiUrl, 'shelby-parse.json', from));
  const md = wikiHtmlToMarkdown(parsed.parse.text, parsed.parse.title);
  writeFileSync(join(OUT, 'wikipedia-shelby-nc-2019.md'), md);
  console.log(`wikipedia-shelby-nc-2019.md  ${words(md)} words  from oldid ${SHELBY_OLDID}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(`fetch-corpus: ${e.message}`); process.exit(1); });
}
