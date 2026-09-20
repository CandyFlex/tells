/**
 * ascii-source.mjs: keep source files ASCII, and prove it.
 *
 *   node scripts/ascii-source.mjs --check <files...>   exit 1 and list every non-ASCII character
 *   node scripts/ascii-source.mjs --fix   <files...>   rewrite each one as a u{hex} escape
 *
 * Why this exists: the copy rules ban em and en dashes from everything a user
 * reads, and the obvious check (grep for the character) silently matched
 * nothing in a shell whose locale was not UTF-8. A check that cannot fail is
 * not a check. This one decodes the bytes itself, and a test feeds it a dash
 * and expects it to object.
 *
 * The u{...} escape form needs the `u` flag inside a regular expression.
 * --check also reports any regex literal that uses the form without the flag,
 * because without it the pattern silently means something else.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const BACKSLASH = String.fromCharCode(92);
const NON_ASCII = /[^\x00-\x7f]/gu;

export function nonAscii(text) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(NON_ASCII)) {
      hits.push({ line: i + 1, col: m.index + 1, code: m[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0') });
    }
  });
  return hits;
}

export function regexWithoutUnicodeFlag(text) {
  const out = [];
  const re = /\/((?:[^/\\\n]|\\.)*\\u\{[0-9a-fA-F]+\}(?:[^/\\\n]|\\.)*)\/([a-z]*)/g;
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(re)) {
      if (!/[uv]/.test(m[2])) out.push({ line: i + 1, regex: m[0] });
    }
  });
  return out;
}

export const escapeNonAscii = (text) =>
  text.replace(NON_ASCII, (c) => `${BACKSLASH}u{${c.codePointAt(0).toString(16)}}`);

/** @returns {{file: string, problems: string[]}[]} */
export function checkFiles(files) {
  return files.map((file) => {
    const text = readFileSync(file, 'utf8');
    return {
      file,
      problems: [
        ...nonAscii(text).map((h) => `${file}:${h.line}:${h.col}  U+${h.code}`),
        // The regex check reads JavaScript. In Markdown a path like src/*.mjs looks like a regex to it.
        ...(file.endsWith('.mjs') || file.endsWith('.js') ? regexWithoutUnicodeFlag(text) : []).map((r) => `${file}:${r.line}  u{...} escape in a regex without the u flag: ${r.regex}`),
      ],
    };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  const files = process.argv.slice(3);
  if (!['--check', '--fix'].includes(mode) || !files.length) {
    console.error('usage: node scripts/ascii-source.mjs --check|--fix <files...>');
    process.exit(2);
  }
  if (mode === '--fix') {
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      const fixed = escapeNonAscii(text);
      if (fixed !== text) {
        writeFileSync(f, fixed);
        console.log(`escaped  ${f}`);
      }
    }
  }
  const problems = checkFiles(files).flatMap((r) => r.problems);
  for (const p of problems) console.log(p);
  console.log(problems.length ? `${problems.length} problem(s)` : `clean: ${files.length} file(s), 0 non-ASCII characters`);
  process.exit(problems.length ? 1 : 0);
}
