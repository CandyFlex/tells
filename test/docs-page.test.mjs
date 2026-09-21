/**
 * The showcase pages show nothing typed: docs/data.js and the computed
 * regions of docs/index.html and docs/rules.html are generated, and this
 * fails when any of them is stale. It also holds the pages to their promise
 * that they talk to no one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { buildData, renderDataJs, buildPage, regions, PAGES } from '../scripts/build-docs-data.mjs';
import { nonAscii } from '../scripts/ascii-source.mjs';
import { analyze, LIMITS, RULES } from '../docs/lib/index.mjs';
import { HERO_PICKS, heroFindings, renderMirror, renderTryResults, gapRows } from '../docs/page.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8').replace(/\r\n?/g, '\n');
const data = buildData();
const html = read('docs', 'index.html');
const rules = read('docs', 'rules.html');
const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

test('docs/data.js is current', () => {
  assert.equal(read('docs', 'data.js'), renderDataJs(data), 'run: npm run docs-data');
});

test('every computed region of every page is current', () => {
  for (const f of PAGES) assert.equal(read('docs', f), buildPage(read('docs', f), data, f), `docs/${f} is stale. run: npm run docs-data`);
});

test('the hero marks only findings the report made, with the report\'s rule, place and weight', () => {
  const report = analyze(data.sample.text);
  assert.equal(heroFindings(report).length, HERO_PICKS.length, 'a hero pick is no longer in the report; update HERO_PICKS in docs/page.mjs');
  const hero = regions(data).hero;
  const marks = [...hero.matchAll(/<span class="mk"[^>]*>([\s\S]*?)<span class="note"><span class="rule-n">([^<]+)<\/span><span class="at">(\d+):(\d+)<\/span><span class="w">([^<]+)<\/span><\/span><\/span>/g)];
  assert.equal(marks.length, HERO_PICKS.length);
  for (const [, match, rule, line, col, weight] of marks) {
    const r = report.rules.find((x) => x.id === rule);
    assert.ok(r, `no rule ${rule}`);
    assert.equal(r.weight, weight);
    assert.ok(r.findings.some((f) => f.match === unescape(match) && f.line === Number(line) && f.col === Number(col)), `not a finding: ${rule} ${line}:${col} ${match}`);
  }
});

test('the Try it panel ships with what docs/lib computes for the sample', () => {
  const report = analyze(data.sample.text);
  assert.equal(regions(data).mirror, renderMirror(report, data.sample.text));
  assert.equal(regions(data).results, renderTryResults(report));
});

test('the gap chart agrees with the README computation, rule by rule', () => {
  const { rows } = gapRows(data.corpus);
  for (const s of data.facts.separation) {
    const r = rows.find((x) => x.id === s.id);
    assert.equal(r.hMax, s.humanMax, `${s.id} human max`);
    assert.equal(r.mMin, s.machineMin, `${s.id} machine min`);
    assert.equal(r.sep, s.separates, `${s.id} separates`);
  }
  const sep = rows.filter((r) => r.sep).map((r) => r.id);
  for (const id of sep) assert.ok(regions(data).gap.includes(`<div class="va-row sep"><code>${id}`), `${id} is not highlighted`);
  assert.equal((regions(data).gap.match(/class="va-row[ "]/g) ?? []).length, rows.filter((r) => r.fired).length);
});

test('the pages state the limits, the in-sample disclosure and the caveat in the words of their owners', () => {
  const text = html.replace(/<[^>]+>/g, '');
  for (const l of LIMITS) assert.ok(text.split(l.replace(/&/g, '&amp;')).length >= 3, `limit shown under the results and in the statement: ${l}`);
  assert.ok(read('README.md').includes(data.inSample));
  assert.ok(html.includes('The rates below are in-sample.'));
  assert.ok(html.includes(data.caveat));
  for (const r of RULES) assert.ok(rules.includes(`id="rule-${r.id}"`), `rules page lists ${r.id}`);
  for (const page of [html, rules]) assert.ok(page.includes("Rule catalogue draws on Wikipedia's"));
  assert.ok(html.includes('href="rules.html"'), 'the home page links the rules page');
});

test('NO NETWORK: the pages load nothing from another origin and their scripts cannot call out', () => {
  for (const [name, page] of [['index.html', html], ['rules.html', rules]]) {
    const loads = [...page.matchAll(/<(?:script|link|img|source|iframe|video|audio)\b[^>]*?\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(loads.length >= 4, name);
    for (const u of loads) assert.ok(!/^(?:[a-z]+:)?\/\//i.test(u), `${name} loads from elsewhere: ${u}`);
    assert.match(page, /connect-src 'none'/);
  }
  for (const f of ['style.css', 'home.css']) {
    const css = read('docs', f);
    for (const m of css.matchAll(/url\(([^)]+)\)/g)) assert.match(m[1], /^(?:fonts|mark)\//, `${f}: ${m[1]}`);
    assert.ok(!/@import/.test(css), f);
  }
  for (const f of ['app.mjs', 'page.mjs']) {
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|new Image|import\s*\(/.test(read('docs', f)), `${f} can reach the network`);
  }
});

test('COPY RULES on the page chrome: dashes appear only inside regions that quote a sample', () => {
  const quoted = { 'index.html': ['hero', 'anatomy', 'mirror', 'textarea', 'results', 'versus'], 'rules.html': ['audit'] };
  for (const [f, names] of Object.entries(quoted)) {
    let chrome = read('docs', f);
    for (const name of names) {
      const a = chrome.indexOf(`<!-- gen:${name} -->`);
      const b = chrome.indexOf(`<!-- /gen:${name} -->`);
      assert.ok(a > -1 && b > a, `${f}: ${name}`);
      chrome = chrome.slice(0, a) + chrome.slice(b);
    }
    assert.deepEqual(nonAscii(chrome), [], f);
  }
  for (const f of ['style.css', 'home.css', 'app.mjs', 'page.mjs']) assert.deepEqual(nonAscii(read('docs', f)), [], f);
});
