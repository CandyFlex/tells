/**
 * sync-docs.mjs: copy the browser-safe part of src/ into docs/lib/.
 *
 *   node scripts/sync-docs.mjs           copy
 *   node scripts/sync-docs.mjs --check   exit 1 if docs/lib differs from src
 *
 * docs/lib is a byte-for-byte copy of everything in src/ except src/node/,
 * so the showcase page runs the real linter and not a rewrite of it. The
 * check also proves the claim that makes the copy possible: no browser-safe
 * module imports a node: builtin or reaches into src/node/.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const LIB = join(ROOT, 'docs', 'lib');

function walk(dir, skip = []) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (skip.includes(p)) continue;
    if (e.isDirectory()) out.push(...walk(p, skip));
    else out.push(p);
  }
  return out;
}

const rel = (base, p) => relative(base, p).split(sep).join('/');
export const browserSafeFiles = () => walk(SRC, [join(SRC, 'node')]).map((p) => rel(SRC, p)).sort();

/** @returns {string[]} problems; empty means docs/lib is an exact, browser-safe copy */
export function checkSync() {
  const problems = [];
  const want = browserSafeFiles();
  const have = walk(LIB).map((p) => rel(LIB, p)).sort();
  for (const f of want) {
    const src = readFileSync(join(SRC, f));
    if (/from\s+['"]node:|import\(['"]node:|from\s+['"][^'"]*\/node\//.test(src.toString('utf8'))) problems.push(`src/${f} imports a node: builtin or src/node, so it is not browser-safe`);
    if (!have.includes(f)) problems.push(`docs/lib/${f} is missing`);
    else if (!src.equals(readFileSync(join(LIB, f)))) problems.push(`docs/lib/${f} differs from src/${f}`);
  }
  for (const f of have) if (!want.includes(f)) problems.push(`docs/lib/${f} has no source in src/`);
  return problems;
}

export function sync() {
  rmSync(LIB, { recursive: true, force: true });
  for (const f of browserSafeFiles()) {
    mkdirSync(dirname(join(LIB, f)), { recursive: true });
    writeFileSync(join(LIB, f), readFileSync(join(SRC, f)));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--check')) {
    const problems = checkSync();
    for (const p of problems) console.error(p);
    console.log(problems.length ? `docs/lib is out of sync: ${problems.length} problem(s). Run: npm run sync-docs` : `docs/lib matches src: ${browserSafeFiles().length} files, byte for byte`);
    process.exit(problems.length ? 1 : 0);
  }
  sync();
  console.log(`copied ${browserSafeFiles().length} files to docs/lib`);
}
