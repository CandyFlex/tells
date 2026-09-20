/**
 * Tests for the command line: exit codes, the opt-in gates, stdin, --out,
 * and a full write-report / audit / tamper / audit cycle through real
 * processes and real files.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LIMITS, RULE_IDS } from '../src/index.mjs';
import { nonAscii } from '../scripts/ascii-source.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BIN = join(ROOT, 'bin', 'tells.mjs');
const MACHINE = 'test/fixtures/constructed-machine.md';
const PLAIN = 'test/fixtures/constructed-plain.md';

const tells = (args, opts = {}) => spawnSync(process.execPath, [BIN, ...args], { cwd: ROOT, encoding: 'utf8', ...opts });

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'tells-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('exit code is 0 by default, even on a document full of findings', () => {
  const r = tells([MACHINE]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /chat-residue {2}\(strong\)/);
  assert.ok(r.stdout.trimEnd().endsWith(`reproduce: tells ${MACHINE}`));
  for (const l of LIMITS) assert.ok(r.stdout.includes(l));
});

test('front matter, the code fence and the URL in the fixture produce no vocabulary findings', () => {
  const report = JSON.parse(tells([MACHINE, '--format', 'json']).stdout);
  const vocab = report.rules.find((r) => r.id === 'vocabulary');
  const lines = vocab.findings.map((f) => f.line);
  assert.ok(lines.every((l) => l === 8 || l === 10), `vocabulary fired on lines ${lines}`);
  assert.equal(report.rules.find((r) => r.id === 'em-dash').count, 1, 'the dash in the code comment is not counted');
  const artifacts = report.rules.find((r) => r.id === 'model-artifacts');
  assert.deepEqual(artifacts.findings.map((f) => [f.match, f.weight]), [['utm_source=chatgpt.com', 'weak']]);
});

test('--fail-on strong trips on chat residue and not on a weak utm_source or on plain prose', () => {
  const hit = tells([MACHINE, '--fail-on', 'strong']);
  assert.equal(hit.status, 1);
  assert.match(hit.stderr, /--fail-on strong: 2 finding\(s\) in chat-residue/);
  assert.equal(tells([MACHINE, '--fail-on', 'strong', '--ignore', 'chat-residue']).status, 0, 'utm_source alone is weak');
  assert.equal(tells([PLAIN, '--fail-on', 'any']).status, 0);
  assert.equal(tells([MACHINE, '--fail-on', 'moderate', '--only', 'puffery']).status, 0, 'puffery is weak');
  assert.equal(tells([MACHINE, '--fail-on', 'any', '--only', 'puffery']).status, 1);
});

test('--max exits 1 only when the count is exceeded, and can be repeated', () => {
  assert.equal(tells([MACHINE, '--max', 'em-dash=1']).status, 0);
  const over = tells([MACHINE, '--max', 'em-dash=0', '--max', 'puffery=99']);
  assert.equal(over.status, 1);
  assert.match(over.stderr, /--max em-dash=0: count is 1/);
  assert.doesNotMatch(over.stderr, /puffery/);
});

test('usage errors exit 2 with a message, never a stack trace', () => {
  const cases = [
    [['nope.md'], /cannot read nope\.md/],
    [[MACHINE, '--format', 'xml'], /unknown format "xml"/],
    [[MACHINE, '--only', 'nope'], /unknown rule "nope"/],
    [[MACHINE, '--max', 'nope=1'], /unknown rule "nope"/],
    [[MACHINE, '--max', 'em-dash'], /--max takes rule=N/],
    [[MACHINE, '--fail-on', 'weak'], /--fail-on takes one of/],
    [[MACHINE, '--wat'], /unknown option --wat/],
    [[MACHINE, PLAIN], /one document at a time/],
    [['audit', 'x.json'], /audit needs a report and the document/],
    [[], /tells <file\|->/],
  ];
  for (const [args, re] of cases) {
    const r = tells(args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr + r.stdout, re);
    assert.doesNotMatch(r.stderr, /\n\s+at /, 'no stack trace');
  }
});

test('--help and --version exit 0; the help names every rule and states the limits first', () => {
  const h = tells(['--help']);
  assert.equal(h.status, 0);
  for (const id of RULE_IDS) assert.ok(h.stdout.includes(id), id);
  assert.ok(h.stdout.indexOf('cannot determine authorship') < h.stdout.indexOf('--format'), 'limits before features');
  assert.deepEqual(nonAscii(h.stdout), [], 'help text is ASCII: no em or en dashes');
  assert.equal(tells(['--version']).stdout.trim(), JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version);
});

test('stdin works and is labelled', () => {
  const r = tells(['-', '--only', 'puffery'], { input: 'A vibrant, world-class venue.' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /<stdin>:1:3 {2}puffery {2}vibrant/);
});

test('--plain turns masking off and --historical turns the old rule on', () => {
  const masked = JSON.parse(tells([MACHINE, '--format', 'json', '--only', 'vocabulary']).stdout);
  const plain = JSON.parse(tells([MACHINE, '--format', 'json', '--only', 'vocabulary', '--plain']).stdout);
  assert.ok(plain.rules[0].count > masked.rules[0].count);
  assert.equal(plain.options.plain, true);
  const hist = JSON.parse(tells([PLAIN, '--format', 'json', '--historical']).stdout);
  assert.ok(hist.rules.some((r) => r.id === 'didactic-disclaimers'));
});

test('rules lists all eighteen with sources', () => {
  const r = tells(['rules']);
  assert.equal(r.status, 0);
  for (const id of RULE_IDS) assert.match(r.stdout, new RegExp(`^${id} {2}\\[`, 'm'));
  assert.deepEqual(nonAscii(r.stdout), [], 'rule descriptions are ASCII');
});

test('sarif and md formats come out of the CLI parseable', () => {
  const sarif = JSON.parse(tells([MACHINE, '--format', 'sarif']).stdout);
  assert.equal(sarif.version, '2.1.0');
  assert.equal(sarif.runs[0].invocations[0].commandLine, `tells ${MACHINE} --format sarif`);
  assert.match(tells([MACHINE, '--format', 'md']).stdout, /^### tells: test\/fixtures\/constructed-machine\.md/);
});

test('END TO END: write a report, audit it (pass), tamper with it (fail), change the document (fail)', (t) => {
  const dir = scratch(t);
  const report = join(dir, 'report.json');
  const w = tells([MACHINE, '--format', 'json', '--out', report]);
  assert.equal(w.status, 0);
  assert.match(w.stderr, /wrote /);
  assert.equal(w.stdout, '', 'with --out nothing goes to stdout');

  const pass = tells(['audit', report, '--against', MACHINE]);
  assert.equal(pass.status, 0, pass.stdout + pass.stderr);
  assert.match(pass.stdout, /PASS {2}\d+ findings in 16 rules recomputed/);
  assert.match(pass.stdout, /reproduce: tells audit /);

  const tampered = JSON.parse(readFileSync(report, 'utf8'));
  tampered.score = 12;
  tampered.rules.find((r) => r.id === 'chat-residue').findings.pop();
  const bad = join(dir, 'tampered.json');
  writeFileSync(bad, JSON.stringify(tampered));
  const fail = tells(['audit', bad, '--against', MACHINE]);
  assert.equal(fail.status, 1);
  assert.match(fail.stdout, /FAIL {2}A5 {2}unexpected key "score"/);
  assert.match(fail.stdout, /FAIL {2}E3 {2}chat-residue/);

  const edited = join(dir, 'edited.md');
  writeFileSync(edited, readFileSync(join(ROOT, MACHINE), 'utf8').replace('sunrise', 'sunset'));
  const moved = tells(['audit', report, '--against', edited]);
  assert.equal(moved.status, 1);
  assert.match(moved.stdout, /FAIL {2}B1 {2}document sha256 does not match/);
});

test('redact withholds the path, and the redacted report still audits', (t) => {
  const dir = scratch(t);
  const report = join(dir, 'r.json');
  const red = join(dir, 'public.json');
  tells([MACHINE, '--format', 'json', '--out', report]);
  assert.equal(tells(['redact', report, '--out', red, '--date', '2026-09-19']).status, 0);
  const text = readFileSync(red, 'utf8');
  assert.ok(!text.includes('constructed-machine'));
  assert.equal(JSON.parse(text).redaction.when, '2026-09-19');
  assert.equal(tells(['audit', red, '--against', MACHINE]).status, 0);
});

test('render writes one self-contained HTML file', (t) => {
  const dir = scratch(t);
  const out = join(dir, 'deep', 'view.html');
  const r = tells(['render', MACHINE, '--out', out, '--caption', 'constructed scenario']);
  assert.equal(r.status, 0);
  assert.ok(existsSync(out), '--out creates missing directories');
  const html = readFileSync(out, 'utf8');
  assert.match(html, /<mark class="strong">I hope this helps<\/mark>/);
  assert.match(html, /constructed scenario/);
  assert.ok(!/<script|<link /i.test(html));
  // The only non-ASCII characters allowed are the document's own (the em dash it contains).
  const chrome = html.replace(/<pre class="src">[\s\S]*?<\/pre>/g, '').replace(/<code>[^<]*<\/code>/g, '');
  assert.deepEqual(nonAscii(chrome), [], 'the page chrome is ASCII');
});
