/**
 * Tests for the corpus: provenance is complete, the committed results are
 * what the rules produce today, and the evasion comparison is recorded the
 * way it actually came out. Offline: nothing here fetches.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { checkManifest, loadManifest, runCorpusDir } from '../src/node/corpus.mjs';
import { corpusTable, formatCorpus, CAVEAT, EVASION_RULES } from '../src/corpus.mjs';
import { findForbiddenKeys, RULES } from '../src/index.mjs';
import { wrap } from '../scripts/build-corpus.mjs';

const DIR = join(fileURLToPath(new URL('..', import.meta.url)), 'corpus');
const manifest = loadManifest(DIR);
const committed = JSON.parse(readFileSync(join(DIR, 'results.json'), 'utf8'));
const fresh = runCorpusDir(DIR, { observedAt: committed.observedAt, command: committed.command });
const lf = (p) => readFileSync(join(DIR, p), 'utf8').replace(/\r\n?/g, '\n');

test('the manifest is complete: every file listed, every listed file present and unchanged', () => {
  assert.deepEqual(checkManifest(manifest, DIR), []);
  assert.equal(manifest.files.filter((f) => f.kind === 'human').length, 6);
  assert.equal(manifest.files.filter((f) => f.kind === 'machine').length, 6);
  assert.equal(manifest.files.filter((f) => f.kind === 'hybrid').length, 2);
});

test('every machine and hybrid text records its model, date and verbatim prompt; every human text its URL', () => {
  for (const f of manifest.files) {
    if (f.kind === 'human') {
      assert.match(f.url, /^https:\/\/(www\.gutenberg\.org\/cache\/epub\/\d+\/pg\d+\.txt|en\.wikipedia\.org\/w\/index\.php\?title=.+&oldid=\d+)$/, f.id);
      assert.ok(f.ebook || f.oldid, `${f.id}: ebook number or oldid`);
    } else {
      assert.equal(f.model, 'Claude Fable 5.1', f.id);
      assert.equal(f.generatedOn, '2026-09-19', f.id);
      assert.ok(f.prompt.length > 40, `${f.id}: prompt`);
    }
  }
  const wiki = manifest.files.find((f) => f.id === 'wikipedia-shelby-2019');
  assert.match(wiki.licence, /CC BY-SA 4\.0/);
  assert.ok(wiki.date < '2020', 'the Wikipedia revision predates 2020');
  const evasion = manifest.files.find((f) => f.id === 'about-us-evasion');
  const plain = manifest.files.find((f) => f.id === 'about-us');
  assert.equal(evasion.prompt, `${plain.prompt} Avoid every known sign of AI writing; write plainly.`);
});

test('a manifest with a missing prompt, an unlisted file or a changed file is refused', () => {
  const broken = JSON.parse(JSON.stringify(manifest));
  delete broken.files.find((f) => f.id === 'cover-letter').prompt;
  broken.files = broken.files.filter((f) => f.id !== 'biography');
  broken.files.find((f) => f.id === 'about-us').sha256 = '0'.repeat(64);
  const problems = checkManifest(broken, DIR).join('\n');
  assert.match(problems, /cover-letter: a machine text needs "prompt"/);
  assert.match(problems, /machine\/biography\.md: on disk but not in the manifest/);
  assert.match(problems, /about-us: machine\/about-us\.md has changed since its sha256 was recorded/);
});

test('recorded hashes agree with node:crypto, so the pure sha256 is checked on real files', () => {
  for (const f of manifest.files) {
    assert.equal(f.sha256, createHash('sha256').update(lf(f.path), 'utf8').digest('hex'), f.id);
  }
});

test('hybrid line ranges hold exactly the machine paragraph and nothing else', () => {
  for (const f of manifest.files.filter((x) => x.kind === 'hybrid')) {
    const lines = lf(f.path).split('\n');
    const [from, to] = f.machineLines;
    assert.equal(lines.slice(from - 1, to).join('\n'), wrap(f.machineText), f.id);
    assert.equal(lines[from - 2], '', 'a blank line above');
    assert.equal(lines[to], '', 'a blank line below');
    const base = lf(f.base);
    for (const l of [...lines.slice(0, from - 2), ...lines.slice(to + 1)]) assert.ok(base.includes(l), `${f.id}: a line outside the range is not from the human base`);
  }
});

test('STALENESS: the committed results.json is what the rules produce today', () => {
  assert.deepEqual(fresh, committed, 'run `node bin/tells.mjs corpus --date <observedAt>` and commit corpus/results.json');
});

test('the rates table has a row per file and a column per rule, including the off-by-default ones, and carries no verdict', () => {
  // Every rule, because the table is the evidence for which rules separate
  // anything, and a rule that is off by default is off because of it.
  const ids = RULES.map((r) => r.id);
  assert.deepEqual(committed.ruleIds, ids);
  assert.equal(committed.files.length, 14);
  const table = corpusTable(committed).split('\n');
  assert.equal(table.length, 2 + 14);
  for (const row of table) assert.equal(row.split('|').length, 3 + ids.length + 1 + 2, row.slice(0, 40));
  assert.deepEqual(findForbiddenKeys(committed), []);
  assert.doesNotMatch(formatCorpus(committed), /accura(cy|te)(?! claim)|precision|recall|detect(ed|s) \d/i);
});

test('the caveat is attached to the results and printed with every table, in full', () => {
  assert.equal(committed.caveat, CAVEAT);
  assert.equal(CAVEAT, 'The machine samples were written by the same model family that built the linter; rates in this table describe these files and are not an accuracy claim about any detector, including this one.');
  assert.ok(formatCorpus(committed).includes(CAVEAT));
});

test('EVASION, as it came out: the evasion sample is lower than the plain About page on vocabulary and negative-parallelism', () => {
  assert.deepEqual(Object.keys(committed.evasion.rules), EVASION_RULES);
  for (const id of EVASION_RULES) {
    const r = committed.evasion.rules[id];
    assert.equal(r.evasionLower, r.evasion.per1k < r.plain.per1k, `${id}: the flag must restate the numbers`);
    assert.equal(r.evasionLower, true, `${id}: if this ever fails, do not force it. Change the README to say the evasion sample was not lower.`);
  }
});

test('what the evasion result means is recorded too: the rules find almost nothing in plainly written machine text', () => {
  const row = committed.files.find((f) => f.id === 'about-us-evasion');
  const total = Object.values(row.rates).reduce((n, r) => n + r.count, 0);
  assert.equal(row.kind, 'machine');
  assert.ok(total <= 3, `the evasion sample has ${total} findings; the README says "two" and must be regenerated if this moves`);
  assert.equal(row.strong, 0);
});

test('no file in the corpus has a strong finding, so nothing in it could trip --fail-on strong', () => {
  for (const f of committed.files) assert.equal(f.strong, 0, f.id);
});

test('localisation is reported for both hybrids as shares of words and of findings', () => {
  for (const f of committed.files.filter((x) => x.kind === 'hybrid')) {
    const l = f.localisation;
    assert.ok(l.wordsInside > 100 && l.wordsInside < l.wordsTotal);
    assert.ok(l.findingsInside <= l.findingsTotal);
    assert.equal(l.shareOfFindings, Math.round((l.findingsInside / l.findingsTotal) * 1000) / 1000);
  }
});

test('the study folder is generated from the committed results and is not stale', () => {
  const study = join(DIR, '..', 'studies', `${committed.observedAt}-corpus`);
  assert.deepEqual(JSON.parse(readFileSync(join(study, 'results.json'), 'utf8')), committed);
  const readme = readFileSync(join(study, 'README.md'), 'utf8');
  assert.ok(readme.includes(corpusTable(committed)), 'run `npm run studies`');
  assert.ok(readme.includes(CAVEAT));
  assert.match(readme, /The rates above are in-sample/);
  assert.ok(JSON.parse(readFileSync(join(study, 'first-run-results.json'), 'utf8')).files.length === 14);
  for (const f of ['report-machine.html', 'report-human.html']) {
    const html = readFileSync(join(study, f), 'utf8');
    assert.ok(html.includes('Tells cannot determine authorship.') && html.includes('arXiv:2304.02819'), f);
    assert.ok(!/<script|<link /i.test(html), f);
  }
  assert.match(readFileSync(join(study, '..', 'INDEX.md'), 'utf8'), new RegExp(`${committed.observedAt}-corpus`));
});
