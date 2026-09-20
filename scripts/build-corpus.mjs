/**
 * build-corpus.mjs: compose the hybrid texts and stamp the manifest.
 *
 *   node scripts/build-corpus.mjs
 *
 * Deterministic and offline. Two jobs:
 *
 * 1. For every hybrid entry in corpus/MANIFEST.json, take whole paragraphs of
 *    its human base text up to `baseWords`, insert `machineText` (wrapped to
 *    72 columns so it sits in the file like its neighbours) after paragraph
 *    number `insertAfterParagraph`, write the file, and record the inserted
 *    line range as `machineLines`. The range is computed here so nobody
 *    types it.
 *
 * 2. For every entry, record the file's word count and the sha256 of its
 *    LF-normalised text. `tells corpus` refuses to run if a file no longer
 *    matches its recorded hash, so a corpus text cannot drift unnoticed.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sha256 } from '../src/sha256.mjs';
import { parseDocument } from '../src/document.mjs';

const DIR = join(fileURLToPath(new URL('..', import.meta.url)), 'corpus');
const WIDTH = 72;

const countWords = (s) => parseDocument(s, { plain: true }).counts.words;

export function wrap(text, width = WIDTH) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

export function composeHybrid(baseText, entry) {
  const paragraphs = baseText.replace(/\r\n?/g, '\n').split(/\n\s*\n/).filter((p) => p.trim());
  const kept = [];
  let n = 0;
  for (const p of paragraphs) {
    kept.push(p.replace(/\s+$/, ''));
    n += countWords(p);
    if (n >= entry.baseWords) break;
  }
  if (entry.insertAfterParagraph >= kept.length) throw new Error(`${entry.id}: insertAfterParagraph is past the end of the base text`);
  const inserted = wrap(entry.machineText);
  const before = kept.slice(0, entry.insertAfterParagraph).join('\n\n');
  const after = kept.slice(entry.insertAfterParagraph).join('\n\n');
  const firstLine = before.split('\n').length + 2; // the paragraph above, then one blank line
  const text = `${before}\n\n${inserted}\n\n${after}\n`;
  return { text, machineLines: [firstLine, firstLine + inserted.split('\n').length - 1] };
}

function main() {
  const manifestPath = join(DIR, 'MANIFEST.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const entry of manifest.files) {
    const file = join(DIR, entry.path);
    if (entry.kind === 'hybrid') {
      const { text, machineLines } = composeHybrid(readFileSync(join(DIR, entry.base), 'utf8'), entry);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
      entry.machineLines = machineLines;
    }
    const text = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
    entry.words = countWords(text);
    entry.sha256 = sha256(text);
    console.log(`${entry.kind.padEnd(8)} ${String(entry.words).padStart(5)} words  ${entry.path}${entry.machineLines ? `  machine lines ${entry.machineLines.join('-')}` : ''}`);
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
