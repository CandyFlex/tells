/**
 * Tamper tests. A clean report passes; then each test damages one thing and
 * asserts the audit names it. The five tampers the spec lists come first:
 * move a finding's line, inflate a count, add a score key, remove limits,
 * change one character of the document. The rest are the ways a report could
 * be made to look better than the text it came from.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { analyze, audit, formatAudit, formatText, formatMarkdown, formatSarif, RULE_IDS } from '../src/index.mjs';

const DASH = '\u{2014}';
const DOC = [
  '# About Us',
  '',
  `Nestled in the heart of downtown, our bakery is not just a shop ${DASH} it's a vibrant community hub.`,
  'We offer fresh bread, warm service, and lasting memories.',
  '',
  'Experts say sourdough is pivotal. Additionally, our commitment to quality stands as a testament to our craft.',
  '',
  'I hope this helps!',
].join('\n');

/**
 * The recorded command has to agree with the options, because the audit
 * checks that (A8): a report analysed with --ignore and relabelled as a plain
 * run is the cheapest forgery there is.
 */
const commandFor = (opts) => [
  'tells about.md',
  opts.plain ? '--plain' : '',
  opts.historical ? '--historical' : '',
  opts.only?.length ? `--only ${opts.only.join(',')}` : '',
  opts.ignore?.length ? `--ignore ${opts.ignore.join(',')}` : '',
  opts.include?.length ? `--include ${opts.include.join(',')}` : '',
].filter(Boolean).join(' ');

const clean = (opts = {}) => analyze(DOC, { path: 'about.md', command: commandFor(opts), observedAt: '2026-09-19T12:00:00.000Z', ...opts });
const copy = (x) => JSON.parse(JSON.stringify(x));
const ids = (result) => result.findings.filter((f) => f.level === 'CRITICAL').map((f) => f.id);
const ruleOf = (report, id) => report.rules.find((r) => r.id === id);

test('a clean report passes, and says how much it recomputed', () => {
  const r = clean();
  const result = audit(r, DOC);
  assert.equal(result.ok, true, JSON.stringify(result.findings, null, 2));
  assert.equal(result.checked.findings, r.totals.findings);
  assert.match(formatAudit(result), new RegExp(`PASS {2}\\d+ findings in ${r.rules.length} rules recomputed from the document`));
});

test('a report survives a JSON round trip and CRLF line endings in the document', () => {
  const r = copy(clean());
  assert.equal(audit(r, DOC).ok, true);
  assert.equal(audit(r, DOC.replace(/\n/g, '\r\n')).ok, true, 'the hash is taken after line endings are normalised');
});

/* ---------------- the five tampers the spec names ---------------- */

test('TAMPER 1: move a finding to another line', () => {
  const r = copy(clean());
  ruleOf(r, 'puffery').findings[0].line += 1;
  const result = audit(r, DOC);
  assert.equal(result.ok, false);
  assert.ok(ids(result).includes('C1'), 'the match is no longer at its line:col');
});

test('TAMPER 2: inflate a count', () => {
  const r = copy(clean());
  ruleOf(r, 'vocabulary').count += 5;
  const result = audit(r, DOC);
  assert.equal(result.ok, false);
  assert.ok(ids(result).includes('D1'));
});

test('TAMPER 3: add a score key, at the top or buried', () => {
  const top = copy(clean());
  top.score = 0.93;
  assert.ok(ids(audit(top, DOC)).includes('A5'));

  const deep = copy(clean());
  deep.rules[0].findings[0].aiProbability = 0.5;
  const result = audit(deep, DOC);
  assert.equal(result.ok, false);
  assert.match(result.findings.find((f) => f.id === 'A5').message, /rules\[0\]\.findings\[0\]\.aiProbability/);

  const verdict = copy(clean());
  verdict.totals.verdict = 'likely AI';
  assert.ok(ids(audit(verdict, DOC)).includes('A5'));
});

test('TAMPER 4: remove the limits block, or soften it', () => {
  const gone = copy(clean());
  delete gone.limits;
  assert.ok(ids(audit(gone, DOC)).includes('A3'));

  const softened = copy(clean());
  softened.limits[0] = 'Tells can usually determine authorship.';
  assert.ok(ids(audit(softened, DOC)).includes('A4'));

  const trimmed = copy(clean());
  trimmed.limits.splice(2, 1); // drop the 61% line
  assert.ok(ids(audit(trimmed, DOC)).includes('A4'));
});

test('TAMPER 5: change one character of the document', () => {
  const r = clean();
  const result = audit(r, DOC.replace('sourdough', 'sourdoogh'));
  assert.equal(result.ok, false);
  assert.ok(ids(result).includes('B1'), 'sha256 no longer matches');
});

/* ---------------- ways to make a report look better ---------------- */

test('deleting the worst finding and fixing up every figure is still caught, by replay', () => {
  const r = copy(clean());
  const rule = ruleOf(r, 'chat-residue');
  assert.equal(rule.findings.length, 1);
  rule.findings = [];
  rule.count = 0;
  rule.per1k = 0;
  r.totals.findings -= 1;
  r.totals.distinctSpans -= 1;
  r.totals.byWeight.strong -= 1;
  r.totals.rulesTriggered -= 1;
  const result = audit(r, DOC);
  assert.equal(result.ok, false);
  assert.deepEqual(ids(result), ['E3'], 'locations and arithmetic all pass; only the replay notices');
  assert.match(result.findings.find((f) => f.id === 'E3').message, /I hope this helps/);
});

test('dropping a whole rule from the report is caught', () => {
  const r = copy(clean());
  r.rules = r.rules.filter((x) => x.id !== 'chat-residue');
  r.totals.findings -= 1;
  r.totals.byWeight.strong -= 1;
  r.totals.rulesTriggered -= 1;
  assert.ok(ids(audit(r, DOC)).includes('E2'));
});

test('an invented finding at a real location is caught', () => {
  const r = copy(clean());
  const rule = ruleOf(r, 'model-artifacts');
  rule.findings.push({ line: 1, col: 3, offset: 2, length: 5, match: 'About', excerpt: 'About Us' });
  rule.count = 1;
  rule.per1k = Math.round((1 / r.document.words) * 100000) / 100;
  r.totals.findings += 1;
  r.totals.distinctSpans += 1;
  r.totals.byWeight.strong += 1;
  r.totals.rulesTriggered += 1;
  assert.deepEqual(ids(audit(r, DOC)), ['E4']);
});

test('a doctored rate, baseline comparison or total is caught', () => {
  const rate = copy(clean());
  ruleOf(rate, 'em-dash').per1k = 0.5;
  assert.ok(ids(audit(rate, DOC)).includes('D2'));

  const above = copy(clean());
  ruleOf(above, 'em-dash').aboveBaseline = false;
  assert.ok(ids(audit(above, DOC)).includes('D3'));

  const totals = copy(clean());
  totals.totals.byWeight.strong = 0;
  assert.ok(ids(audit(totals, DOC)).includes('D5'));
});

test('reweighting a strong finding as weak is caught', () => {
  const r = copy(clean());
  ruleOf(r, 'chat-residue').findings[0].weight = 'weak';
  r.totals.byWeight.strong -= 1;
  r.totals.byWeight.weak += 1;
  assert.ok(ids(audit(r, DOC)).includes('E3'));
});

test('doctored document counts are caught', () => {
  const r = copy(clean());
  r.document.words *= 2;
  assert.ok(ids(audit(r, DOC)).includes('B2'));
});

test('a report made with --plain or --only replays with those options, and lying about them fails', () => {
  assert.equal(audit(clean({ plain: true }), DOC).ok, true);
  assert.equal(audit(clean({ only: ['em-dash', 'puffery'] }), DOC).ok, true);
  assert.equal(audit(clean({ historical: true }), DOC).ok, true);
  assert.equal(audit(clean({ include: ['didactic-disclaimers'] }), DOC).ok, true);
  const lied = copy(clean({ only: ['em-dash'] }));
  lied.options.only = [];
  assert.ok(ids(audit(lied, DOC)).includes('E2'));
});

test('garbage in: wrong schema, no command, no document', () => {
  assert.ok(ids(audit({ schema: 'other/thing@9' }, DOC)).includes('A1'));
  const r = copy(clean());
  delete r.command;
  assert.ok(ids(audit(r, DOC)).includes('A2'));
  assert.throws(() => audit(clean()), /document text is required/);
  assert.equal(audit(null, DOC).ok, false);
});

/* ------ the eleven doctored reports that used to pass, one test each ------ */

test('TAMPER: every excerpt rewritten to a confession', () => {
  const r = copy(clean());
  for (const rule of r.rules) for (const f of rule.findings) f.excerpt = 'I am a language model and I wrote this document.';
  const result = audit(r, DOC);
  assert.equal(result.ok, false);
  assert.ok(ids(result).includes('C3'), 'the excerpt is rebuilt from the document');
  assert.match(result.findings.find((f) => f.id === 'C3').message, /is not the document's words/);
});

test('TAMPER: one excerpt quietly widened', () => {
  const r = copy(clean());
  const f = ruleOf(r, 'puffery').findings[0];
  f.excerpt = `${f.excerpt} and we have never used a computer.`;
  assert.ok(ids(audit(r, DOC)).includes('C3'));
});

test('TAMPER: the whole statistics block replaced', () => {
  const r = copy(clean());
  r.stats.sentenceLength = { mean: 0.1, sd: 0, n: 9999, unit: 'words' };
  r.stats.typeTokenRatio.value = 0.01;
  const result = audit(r, DOC);
  assert.equal(result.ok, false);
  assert.ok(ids(result).includes('D6'));
  assert.match(result.findings.find((f) => f.id === 'D6').message, /sentenceLength/);
});

test('TAMPER: a strong rule reweighted to weak, or recategorised out of --fail-on strong', () => {
  const weight = copy(clean());
  ruleOf(weight, 'chat-residue').weight = 'weak';
  weight.totals.byWeight.strong -= 1;
  weight.totals.byWeight.weak += 1;
  assert.ok(ids(audit(weight, DOC)).includes('A10'), 'weight comes from the registry, not the report');

  const category = copy(clean());
  ruleOf(category, 'chat-residue').category = 'vocabulary';
  assert.ok(ids(audit(category, DOC)).includes('A10'));

  const name = copy(clean());
  ruleOf(name, 'puffery').name = 'Definitely a machine';
  assert.ok(ids(audit(name, DOC)).includes('A10'));
});

test('TAMPER: an invented baseline to sit under', () => {
  const r = copy(clean());
  ruleOf(r, 'em-dash').baseline.per1k = 40;
  const result = audit(r, DOC);
  assert.equal(result.ok, false);
  assert.ok(ids(result).includes('A10'), 'the baseline is the registry\'s, not the report\'s');
});

test('TAMPER: the citation under the limits block swapped for a fake lab', () => {
  const r = copy(clean());
  r.limitsSource = { label: 'Acme AI Detection Lab, internal study, 2026', url: 'https://example.invalid/proof' };
  const result = audit(r, DOC);
  assert.equal(result.ok, false);
  assert.ok(ids(result).includes('A9'));
  assert.ok(ids(result).includes('A4') === false, 'the limits text itself was left word perfect, which is the point');
});

test('TAMPER: the too-short warning deleted by declaring the rates reliable', () => {
  const r = copy(clean());
  r.rates = { reliable: true, minWords: 300, note: 'per-1,000-word rates are computed over the whole document' };
  const result = audit(r, DOC);
  assert.equal(result.ok, false);
  assert.ok(ids(result).includes('D7'));
});

test('TAMPER: the report relabelled as being about another file', () => {
  const r = copy(clean());
  r.command = 'tells suspect-essay.md';
  r.document.path = 'suspect-essay.md';
  // The path is a label the report carries; the command is checked for
  // consistency with the options, and the document hash for the text itself.
  assert.equal(audit(r, DOC).ok, true, 'renaming the file proves nothing either way');
  assert.equal(audit(r, `${DOC}\n`).ok, false, 'the text is what is checked');
});

test('TAMPER: observedAt backdated two years, or made up entirely', () => {
  const backdated = copy(clean());
  backdated.observedAt = '2024-09-19T12:00:00.000Z';
  assert.equal(audit(backdated, DOC).ok, true, 'a timestamp is not authenticated; the README says so');

  const nonsense = copy(clean());
  nonsense.observedAt = 'last Tuesday';
  assert.ok(ids(audit(nonsense, DOC)).includes('A11'));
});

test('TAMPER: verdict keys the old forbidden-word list had never heard of', () => {
  const r = copy(clean());
  r.aiRating = 97;
  r.assessment = 'almost certainly machine-written';
  r.riskLevel = 'high';
  r.authorship = { machine: true };
  const messages = audit(r, DOC).findings.filter((f) => f.id === 'A5').map((f) => f.message);
  assert.equal(messages.length, 4, messages.join('\n'));
  for (const k of ['aiRating', 'assessment', 'riskLevel', 'authorship']) {
    assert.ok(messages.some((m) => m.includes(`"${k}"`)), k);
  }
});

test('TAMPER: a forged clean bill of health, made by ignoring every rule', () => {
  const all = RULE_IDS.join(',');
  const r = analyze(DOC, {
    path: 'about.md', observedAt: '2026-09-19T12:00:00.000Z',
    ignore: RULE_IDS, command: `tells about.md --ignore ${all}`,
  });
  assert.equal(r.totals.findings, 0, 'it really does print nothing');
  assert.equal(audit(r, DOC).ok, true, 'an honest empty run is honest');
  assert.equal(r.partialRun.ran, 0);
  assert.equal(r.partialRun.skipped.length, RULE_IDS.length);
  assert.match(formatText(r), /partial run: 0 of 18 rules; rules skipped: /);
  assert.match(formatMarkdown(r), /partial run: 0 of 18 rules/);
  assert.match(formatSarif(r), /partial run: 0 of 18 rules/);

  const lied = copy(r);
  lied.command = 'tells about.md';
  const result = audit(lied, DOC);
  assert.equal(result.ok, false);
  assert.ok(ids(result).includes('A8'), 'the reproduce command no longer selects the rules the report ran');

  const hidden = copy(r);
  hidden.partialRun = null;
  assert.ok(ids(audit(hidden, DOC)).includes('D8'), 'and the partial-run block cannot be deleted either');
});

test('formatAudit prints FAIL lines and a closing verdict on the REPORT, not on the text', () => {
  const r = copy(clean());
  delete r.limits;
  const out = formatAudit(audit(r, DOC));
  assert.match(out, /FAIL {2}A3 {2}the limits block is missing/);
  assert.match(out, /This report does not describe this document\./);
});
