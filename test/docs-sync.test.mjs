/**
 * docs/lib must be a byte-for-byte copy of the browser-safe part of src/, so
 * the showcase page runs the real linter. This fails when someone edits src/
 * and forgets `npm run sync-docs`, and when a browser-safe module starts
 * importing a node: builtin.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { checkSync, browserSafeFiles } from '../scripts/sync-docs.mjs';
import { checkFiles, nonAscii, regexWithoutUnicodeFlag, escapeNonAscii } from '../scripts/ascii-source.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('docs/lib is an exact copy of src minus src/node, and nothing in it imports node:', () => {
  assert.deepEqual(checkSync(), [], 'run: npm run sync-docs');
  const files = browserSafeFiles();
  assert.ok(files.includes('index.mjs') && files.includes('rules/lexicon.mjs') && files.includes('audit.mjs'));
  assert.ok(!files.some((f) => f.startsWith('node/')));
});

test('the copy in docs/lib is the code that runs: it produces the same report as src', async () => {
  const lib = await import(pathToFileURL(join(ROOT, 'docs', 'lib', 'index.mjs')).href);
  const src = await import('../src/index.mjs');
  const text = readFileSync(join(ROOT, 'test', 'fixtures', 'constructed-machine.md'), 'utf8');
  const opts = { observedAt: '2026-09-19T00:00:00.000Z' };
  assert.deepEqual(lib.analyze(text, opts), src.analyze(text, opts));
  assert.equal(lib.audit(lib.analyze(text, opts), text).ok, true);
});

test('docs/data.js carries the sample, the observed corpus and the caveat, and nothing typed', async () => {
  const { TELLS_DATA } = await import(pathToFileURL(join(ROOT, 'docs', 'data.js')).href);
  const corpus = JSON.parse(readFileSync(join(ROOT, 'corpus', 'results.json'), 'utf8'));
  assert.deepEqual(TELLS_DATA.corpus, corpus, 'run: npm run docs-data');
  assert.equal(TELLS_DATA.sample.text, readFileSync(join(ROOT, 'corpus', 'machine', 'about-us.md'), 'utf8').replace(/\r\n?/g, '\n'));
  assert.equal(TELLS_DATA.sample.caption, 'Sample written by Claude Fable 5.1 on 2026-09-19 for this corpus; prompt in corpus/MANIFEST.json.');
  assert.equal(TELLS_DATA.caveat, corpus.caveat);
});

/* ---- the dash check itself must be able to fail ---- */

test('the ASCII checker objects to a dash, escapes it, and flags an escape in a regex without the u flag', () => {
  const dash = String.fromCodePoint(0x2014);
  assert.deepEqual(nonAscii(`ok\nbad ${dash} here`), [{ line: 2, col: 5, code: '2014' }]);
  assert.equal(escapeNonAscii(`a${dash}b`), `a${String.fromCharCode(92)}u{2014}b`);
  const bs = String.fromCharCode(92);
  assert.equal(regexWithoutUnicodeFlag(`const r = /${bs}u{2014}/g;`).length, 1);
  assert.equal(regexWithoutUnicodeFlag(`const r = /${bs}u{2014}/gu;`).length, 0);
});

test('COPY RULES: no em or en dash, or any other non-ASCII character, in anything a user reads or runs', () => {
  const files = [
    'README.md', 'SKILL.md', 'AGENTS.md', 'CHANGELOG.md', 'RELEASE.md', 'package.json', 'bin/tells.mjs',
    ...browserSafeFiles().map((f) => `src/${f}`), 'src/node/corpus.mjs',
  ].map((f) => join(ROOT, f));
  const problems = checkFiles(files).flatMap((r) => r.problems);
  assert.deepEqual(problems, []);
});

test('README: generated blocks are current, the spec paragraphs and the caveat are present, the guide is credited', async () => {
  const { build } = await import('../scripts/build-readme.mjs');
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert.equal(build(readme), readme, 'run: node scripts/build-readme.mjs');
  const corpus = JSON.parse(readFileSync(join(ROOT, 'corpus', 'results.json'), 'utf8'));
  assert.ok(readme.includes(corpus.caveat), 'the corpus caveat, in full');
  assert.match(readme, /The rates below are in-sample/);
  assert.match(readme, /flagged an average of 61% of essays by non-native English writers/);
  assert.match(readme, /arXiv:2304\.02819/);
  assert.match(readme, /Signs of AI writing\]\(https:\/\/en\.wikipedia\.org\/wiki\/Wikipedia:Signs_of_AI_writing\) \(CC BY-SA 4\.0\)/);
  assert.ok(readme.indexOf('cannot determine authorship') < readme.indexOf('## Use it'), 'limits before features');
});

test('README, SKILL.md and CLI copy avoid the banned marketing words outside code and quotations', () => {
  const banned = /\b(seamless|elevate|unleash|revolutioni[sz]e|next-gen|cutting-edge|robust|powerful|effortless|delve|leverage|harness|empower|game-changer)\b/i;
  for (const f of ['README.md', 'SKILL.md', 'AGENTS.md', 'RELEASE.md', 'CHANGELOG.md']) {
    const prose = readFileSync(join(ROOT, f), 'utf8').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '').replace(/"[^"\n]*"/g, '');
    assert.doesNotMatch(prose, banned, f);
  }
});
