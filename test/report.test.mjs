/**
 * Tests for the report and its four formats. The two that matter most: no
 * verdict-like key exists anywhere in the report, and the limits block (with
 * the Liang et al. 61% citation) is present in every format.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  analyze, format, formatText, formatMarkdown, formatSarif, formatJson, formatRules, render, redact, audit,
  LIMITS, LIMITS_SOURCE, tokeniseKey, isForbiddenKey, findForbiddenKeys, reportKeyProblems,
  RULES, VERSION, SCHEMA, FORMATS,
} from '../src/index.mjs';

const DASH = '\u{2014}';
const SAMPLE = [
  '# About Us',
  '',
  `Nestled in the heart of downtown, our bakery is not just a shop ${DASH} it's a vibrant community hub. We offer fresh bread, warm service, and lasting memories.`,
  '',
  'Experts say sourdough is pivotal. Additionally, our commitment to quality stands as a testament to our craft, highlighting our passion.',
  '',
  'I hope this helps! :contentReference[oaicite:1]{index=1}',
].join('\n');

const OPTS = { path: 'about.md', command: 'tells about.md', observedAt: '2026-09-19T12:00:00.000Z' };
const report = () => analyze(SAMPLE, OPTS);

/* ---------------- shape ---------------- */

test('the report has the shape the spec fixes', () => {
  const r = report();
  assert.equal(r.schema, SCHEMA);
  assert.equal(r.schema, 'tells/report@1');
  assert.deepEqual(r.tool, { name: 'tells', version: VERSION });
  assert.deepEqual(Object.keys(r.document), ['path', 'sha256', 'bytesSha256', 'words', 'sentences', 'paragraphs', 'lines', 'chars']);
  assert.match(r.document.sha256, /^[0-9a-f]{64}$/);
  assert.match(r.document.bytesSha256, /^[0-9a-f]{64}$/);
  assert.equal(r.observedAt, OPTS.observedAt);
  assert.equal(r.command, 'tells about.md');
  assert.deepEqual(Object.keys(r.totals), ['findings', 'distinctSpans', 'byWeight', 'rulesTriggered']);
  assert.deepEqual(Object.keys(r.totals.byWeight), ['weak', 'moderate', 'strong']);
  for (const rule of r.rules) {
    for (const k of ['id', 'name', 'category', 'weight', 'count', 'per1k', 'baseline', 'aboveBaseline', 'findings']) {
      assert.ok(k in rule, `${rule.id} lacks ${k}`);
    }
    for (const f of rule.findings) {
      for (const k of ['line', 'col', 'length', 'excerpt', 'match']) assert.ok(k in f, `${rule.id} finding lacks ${k}`);
    }
    assert.equal(rule.aboveBaseline, null, `${rule.id}: 56 words is too short to compare with any baseline`);
  }
});

test('the version in the source matches package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(VERSION, pkg.version);
});

test('NO VERDICT: no key anywhere in the report reads as a score, a rating or a probability', () => {
  const r = analyze(SAMPLE, { ...OPTS, historical: true });
  const keys = [];
  const walk = (v) => {
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (!Array.isArray(v)) keys.push(k); walk(x); }
  };
  walk(r);
  assert.ok(keys.length > 100, 'the walk must actually visit the report');
  for (const k of keys) assert.equal(isForbiddenKey(k), false, `forbidden key "${k}"`);
  assert.deepEqual(reportKeyProblems(r), []);
});

test('findForbiddenKeys finds a planted key at any depth', () => {
  assert.deepEqual(findForbiddenKeys({ a: [{ b: { aiProbability: 0.9 } }], Score: 1 }), ['a[0].b.aiProbability', 'Score']);
});

test('a key is tokenised before it is judged, so "underscore" is not a score', () => {
  assert.deepEqual(tokeniseKey('aiScore'), ['ai', 'Score']);
  assert.deepEqual(tokeniseKey('ai_probability'), ['ai', 'probability']);
  assert.deepEqual(tokeniseKey('underscore'), ['underscore']);
  for (const bad of ['score', 'Score', 'aiScore', 'ai_probability', 'verdict', 'likelihood', 'confidence',
    'aiRating', 'assessment', 'riskLevel', 'authorship', 'humanWritten', 'generated', 'detection', 'guilty', 'flagged']) {
    assert.equal(isForbiddenKey(bad), true, `"${bad}" must be refused`);
  }
  for (const ok of ['underscore', 'underscores', 'scorecard', 'sharescore', 'aim', 'said', 'chairman']) {
    assert.equal(isForbiddenKey(ok), false, `"${ok}" is an ordinary word`);
  }
});

test('C1: an honest report on a document full of the words "underscore" and "scorecard" passes its own audit', () => {
  const doc = [
    'The report underscores the point about the scorecard and the confidence interval.',
    '',
    'Probability is a word. So is underscore, and so is underscoring the risk.',
  ].join('\n');
  const r = analyze(doc, { ...OPTS, path: 'us.md', historical: true, command: 'tells us.md --historical' });
  assert.ok(r.rules.find((x) => x.id === 'vocabulary').detail.words.underscore >= 1, 'the word map is keyed by the matched word');
  assert.deepEqual(reportKeyProblems(r), []);
  const result = audit(r, doc);
  assert.equal(result.ok, true, JSON.stringify(result.findings, null, 2));
});

test('a key the schema does not define fails even when it does not read like a verdict', () => {
  const r = analyze(SAMPLE, OPTS);
  r.summary = 'almost certainly machine-written';
  r.rules[0].findings[0].tone = 'suspicious';
  const paths = reportKeyProblems(r).map((p) => p.path);
  assert.deepEqual(paths, ['rules[0].findings[0].tone', 'summary']);
  assert.ok(reportKeyProblems(r).every((p) => /no key named/.test(p.why)));
});

test('the limits block is the four statements, with the 61% figure and its source', () => {
  const r = report();
  assert.deepEqual(r.limits, [...LIMITS]);
  assert.equal(r.limits.length, 4);
  assert.equal(r.limits[0], 'Tells cannot determine authorship.');
  assert.match(r.limits[2], /Seven detectors flagged an average of 61% of TOEFL essays by non-native English writers/);
  assert.match(r.limitsSource.label, /arXiv:2304\.02819/);
  assert.equal(r.limitsSource.url, LIMITS_SOURCE.url);
});

test('totals are a tally of findings by effective weight', () => {
  const r = report();
  const n = r.rules.reduce((a, x) => a + x.findings.length, 0);
  assert.equal(r.totals.findings, n);
  assert.equal(r.totals.byWeight.weak + r.totals.byWeight.moderate + r.totals.byWeight.strong, n);
  assert.ok(r.totals.byWeight.strong >= 2, 'chat residue and the artifact are strong');
  assert.equal(r.totals.rulesTriggered, r.rules.filter((x) => x.findings.length).length);
});

test('a short document says its rates are fragile', () => {
  const r = report();
  assert.equal(r.rates.reliable, false);
  assert.match(r.rates.note, /below 300/);
  const long = analyze(`${'The committee met and approved the budget. '.repeat(60)}`, OPTS);
  assert.equal(long.rates.reliable, true);
});

test('options are recorded, and only/ignore/historical change which rules run', () => {
  assert.deepEqual(report().options, { plain: false, historical: false, only: [], ignore: [], include: [] });
  assert.equal(report().rules.length, RULES.filter((r) => !r.historical).length);
  assert.equal(analyze(SAMPLE, { historical: true }).rules.length, RULES.length);
  assert.deepEqual(analyze(SAMPLE, { only: ['em-dash', 'puffery'] }).rules.map((r) => r.id), ['em-dash', 'puffery']);
  assert.ok(!analyze(SAMPLE, { ignore: ['em-dash'] }).rules.some((r) => r.id === 'em-dash'));
});

test('analysis is deterministic apart from the timestamp', () => {
  assert.deepEqual(report(), report());
});

/* ---------------- every format carries the limits ---------------- */

test('LIMITS IN EVERY FORMAT: all four statements and the Liang citation appear in text, json, md, sarif and rendered HTML', () => {
  const r = report();
  const outputs = { ...Object.fromEntries(FORMATS.map((f) => [f, format(r, f)])), html: render(r, SAMPLE) };
  assert.deepEqual(Object.keys(outputs), ['text', 'json', 'md', 'sarif', 'html']);
  for (const [name, out] of Object.entries(outputs)) {
    for (const limit of LIMITS) assert.ok(out.includes(limit), `${name} is missing: ${limit}`);
    assert.ok(out.includes('61%'), `${name} lacks the 61% figure`);
    assert.ok(out.includes('arXiv:2304.02819'), `${name} lacks the Liang et al. citation`);
  }
});

/* ---------------- text ---------------- */

test('text: findings are path:line:col, grouped by rule, then the table, then limits, then the command', () => {
  const out = formatText(report());
  assert.match(out, /^ {2}about\.md:3:1 {2}puffery {2}Nestled/m);
  assert.match(out, /about\.md:7:1 {2}chat-residue {2}I hope this helps {2}\[reply to a user\] {2}\| I hope this helps!/);
  assert.match(out, /em-dash\s+weak\s+1\s+[\d.]+\s+too short to rate against 3\.23 human nonprofessional prose \(Freeburg 2026, preprint\)\. Also published: 4\.8 .*6\.5 .*10\.62 GPT-4\.1/);
  assert.match(out, /vocabulary\s+moderate\s+\d+\s+[\d.]+\s+none published/);
  const order = ['puffery  (weak)', 'Per rule', 'Statistics (descriptive statistics; detectors abandoned perplexity', 'Limits', 'reproduce: tells about.md'].map((s) => out.indexOf(s));
  assert.ok(order.every((x) => x >= 0), `missing a section: ${order}`);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'sections out of order');
  assert.ok(out.trimEnd().endsWith('reproduce: tells about.md'), 'the report ends with the reproduce command');
  assert.match(out, /Not a verdict/);
});

test('text: stdin has a placeholder path and an empty document says so', () => {
  const out = formatText(analyze('Plain words here.', { command: 'tells -' }));
  assert.match(out, /<stdin>/);
  assert.match(out, /No findings\./);
});

/* ---------------- markdown ---------------- */

test('md: a rule table and a findings table that survive pipes in the text', () => {
  const out = formatMarkdown(analyze('A pivotal | vibrant | crucial day.', OPTS));
  assert.match(out, /\| rule \| weight \| count \| per 1k \| baseline \|/);
  assert.match(out, /\| about\.md:1:3 \| vocabulary \| pivotal \| pivotal \|/);
  assert.match(out, /pivotal \\\| vibrant \\\| crucial/, 'pipes in a cluster match are escaped');
  for (const line of out.split('\n').filter((l) => l.startsWith('| about.md'))) {
    assert.equal(line.replace(/\\\|/g, '').split('|').length, 6, `bad column count: ${line}`);
  }
  assert.match(out, /Reproduce: `tells about\.md`/);
});

/* ---------------- sarif ---------------- */

test('sarif: valid 2.1.0 shape, one reportingDescriptor per rule with a helpUri, levels by weight', () => {
  const r = report();
  const s = JSON.parse(formatSarif(r));
  assert.equal(s.version, '2.1.0');
  assert.match(s.$schema, /sarif-2\.1\.0/);
  assert.equal(s.runs.length, 1);
  const run = s.runs[0];
  assert.equal(run.tool.driver.name, 'tells');
  assert.equal(run.tool.driver.version, VERSION);
  assert.equal(run.tool.driver.rules.length, r.rules.length);
  for (const d of run.tool.driver.rules) {
    assert.match(d.helpUri, /^https:\/\//, `${d.id} helpUri`);
    assert.ok(d.shortDescription.text && d.fullDescription.text);
    const weight = RULES.find((x) => x.id === d.id).weight;
    assert.equal(d.defaultConfiguration.level, weight === 'weak' ? 'note' : 'warning', d.id);
  }
  assert.equal(run.results.length, r.totals.findings);
  for (const res of run.results) {
    assert.equal(run.tool.driver.rules[res.ruleIndex].id, res.ruleId);
    assert.ok(['note', 'warning'].includes(res.level));
    assert.ok(!('error' in res), 'Tells never reports an error level: it is diagnosis, not a gate');
    const reg = res.locations[0].physicalLocation.region;
    assert.ok(reg.startLine >= 1 && reg.startColumn >= 1 && reg.endLine >= reg.startLine);
    assert.equal(res.locations[0].physicalLocation.artifactLocation.uri, 'about.md');
  }
  assert.equal(run.columnKind, 'utf16CodeUnits');
});

test('sarif: the limits go into invocations[0].toolExecutionNotifications', () => {
  const inv = JSON.parse(formatSarif(report())).runs[0].invocations[0];
  assert.equal(inv.executionSuccessful, true);
  assert.equal(inv.commandLine, 'tells about.md');
  const texts = inv.toolExecutionNotifications.map((n) => n.message.text);
  assert.deepEqual(texts.slice(0, 4), [...LIMITS]);
  assert.match(texts[4], /Liang et al.*arXiv:2304\.02819/);
  for (const n of inv.toolExecutionNotifications) assert.equal(n.level, 'note');
});

test('sarif: a weak finding inside a strong rule is a note, and Windows paths become URIs', () => {
  const r = analyze('See https://example.com/?utm_source=chatgpt.com now.', { path: 'docs\\a b.md', only: ['model-artifacts'] });
  const run = JSON.parse(formatSarif(r)).runs[0];
  assert.equal(run.results[0].level, 'note');
  assert.equal(run.results[0].locations[0].physicalLocation.artifactLocation.uri, 'docs/a b.md');
});

test('sarif: a multi-line match has a correct end position', () => {
  const r = analyze('The hall serves\nas a meeting place.', { only: ['copula-avoidance'] });
  const reg = JSON.parse(formatSarif(r)).runs[0].results[0].locations[0].physicalLocation.region;
  assert.deepEqual([reg.startLine, reg.startColumn, reg.endLine, reg.endColumn], [1, 10, 2, 3]);
});

test('json round-trips and unknown formats are refused', () => {
  assert.deepEqual(JSON.parse(formatJson(report())), report());
  assert.throws(() => format(report(), 'xml'), /unknown format "xml"/);
});

test('rules listing names every rule with its weight, baseline and source', () => {
  const out = formatRules();
  for (const r of RULES) assert.ok(out.includes(`${r.id}  [${r.category}, ${r.weight}`), r.id);
  assert.match(out, /baseline: 3\.23 per 1k/);
  assert.match(out, /Wikipedia: Signs of AI writing \(CC BY-SA 4\.0\)/);
  assert.match(out, /off by default: --include didactic-disclaimers/);
  assert.ok(out.indexOf('Tells cannot determine authorship.') < out.indexOf('vocabulary  ['), 'the catalogue states the limits first');
  for (const l of LIMITS) assert.ok(out.includes(l), l);
});

/* ---------------- render ---------------- */

test('render: self-contained HTML with the findings underlined from the report offsets', () => {
  const r = report();
  const html = render(r, SAMPLE, { caption: 'constructed scenario' });
  assert.match(html, /^<!doctype html>/);
  assert.ok(!/<script|<link|src=|@import|url\(/i.test(html), 'no script and no external resource');
  assert.match(html, /prefers-color-scheme:dark/);
  assert.match(html, /<mark class="strong">I hope this helps<\/mark>/);
  assert.match(html, /<mark class="weak">Nestled<\/mark>/);
  assert.equal((html.match(/<li><b>/g) || []).length, r.totals.findings, 'one margin note per finding');
  assert.match(html, /constructed scenario/);
  assert.match(html, /Signs of AI writing \(CC BY-SA 4\.0\)/);
});

test('render: document text is escaped, never injected', () => {
  const html = render(analyze('A pivotal <img src=x onerror=alert(1)> & "day".'), 'A pivotal <img src=x onerror=alert(1)> & "day".');
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp;'));
});

/* ---------------- redact ---------------- */

test('redact: removes the path and the command, records what it did, and still passes audit', () => {
  const r = report();
  const red = redact(r, { when: '2026-09-19' });
  assert.ok(!('path' in red.document));
  assert.equal(red.command, 'tells <path withheld>');
  assert.deepEqual(red.redaction.fields, ['document.path', 'command']);
  assert.equal(red.redaction.when, '2026-09-19');
  assert.ok(!JSON.stringify(red).includes('about.md'));
  assert.deepEqual(red.rules, r.rules);
  assert.equal(audit(red, SAMPLE).ok, true);
  assert.deepEqual(redact(r, { when: '2026-09-19' }), red, 'deterministic');
  assert.ok('path' in r.document, 'the input is not mutated');
});
