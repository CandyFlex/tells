/**
 * node/corpus.mjs: the part of the corpus run that touches the disk.
 *
 * Reads MANIFEST.json and the files it lists, refuses a manifest that is
 * incomplete, and hands strings to the pure runner in ../corpus.mjs.
 *
 * The manifest is checked before anything is measured, because a rates table
 * is only as honest as the provenance of its rows. A file on disk that the
 * manifest does not list, a machine sample with no recorded prompt, or a
 * listed file that has changed since its hash was recorded, all stop the run.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { runCorpus } from '../corpus.mjs';
import { sha256 } from '../sha256.mjs';

export const KINDS = ['human', 'machine', 'hybrid'];

function walk(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else out.push(relative(base, p).split(sep).join('/'));
  }
  return out;
}

/** @returns {string[]} problems; empty means the manifest is complete */
export function checkManifest(manifest, dir) {
  const problems = [];
  if (!Array.isArray(manifest?.files) || !manifest.files.length) return ['manifest has no files'];
  const listed = new Set();
  for (const f of manifest.files) {
    const tag = f.id ?? f.path ?? '(unnamed)';
    for (const k of ['id', 'path', 'kind', 'title', 'author', 'date', 'licence', 'origin', 'obtained']) {
      if (!f[k]) problems.push(`${tag}: missing "${k}"`);
    }
    if (f.kind && !KINDS.includes(f.kind)) problems.push(`${tag}: kind must be one of ${KINDS.join(', ')}`);
    if (f.kind === 'human' && !f.url) problems.push(`${tag}: a human text needs the url it was fetched from`);
    if (f.kind === 'machine' || f.kind === 'hybrid') {
      for (const k of ['model', 'prompt', 'generatedOn']) if (!f[k]) problems.push(`${tag}: a ${f.kind} text needs "${k}"`);
    }
    if (f.kind === 'hybrid') {
      if (!Array.isArray(f.machineLines) || f.machineLines.length !== 2) problems.push(`${tag}: a hybrid text needs machineLines [from, to]`);
      if (!f.url) problems.push(`${tag}: a hybrid text needs the url of its human part`);
    }
    if (f.path) {
      listed.add(f.path);
      const p = join(dir, f.path);
      if (!existsSync(p)) problems.push(`${tag}: ${f.path} does not exist`);
      else if (f.sha256 && sha256(readFileSync(p, 'utf8').replace(/\r\n?/g, '\n')) !== f.sha256) {
        problems.push(`${tag}: ${f.path} has changed since its sha256 was recorded`);
      }
    }
  }
  for (const p of walk(dir)) {
    if (p === 'MANIFEST.json' || p === 'results.json' || p === 'README.md') continue;
    if (!listed.has(p)) problems.push(`${p}: on disk but not in the manifest`);
  }
  return problems;
}

export function loadManifest(dir) {
  const path = join(dir, 'MANIFEST.json');
  if (!existsSync(path)) throw new Error(`no MANIFEST.json in ${dir}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Run the rules over every file the manifest lists.
 * @param {string} dir
 * @param {object} [opts]  observedAt (YYYY-MM-DD), command
 */
export function runCorpusDir(dir, opts = {}) {
  const manifest = loadManifest(dir);
  const problems = checkManifest(manifest, dir);
  if (problems.length) throw new Error(`corpus manifest is incomplete:\n  ${problems.join('\n  ')}`);
  return runCorpus(manifest, (p) => readFileSync(join(dir, p), 'utf8'), opts);
}
