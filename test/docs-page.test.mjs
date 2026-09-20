/**
 * The showcase page shows nothing typed: docs/data.js and the computed
 * regions of docs/index.html are generated, and this fails when either is
 * stale. It also holds the page to its promise that it talks to no one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { buildData, renderDataJs, buildPage, regions } from '../scripts/build-docs-data.mjs';
import { nonAscii } from '../scripts/ascii-source.mjs';
import { analyze, LIMITS, RULES } from '../docs/lib/index.mjs';
import { renderManuscript } from '../docs/page.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8').replace(/\r\n?/g, '\n');
const data = buildData();
const html = read('docs', 'index.html');

test('docs/data.js is current', () => {
  assert.equal(read('docs', 'data.js'), renderDataJs(data), 'run: npm run docs-data');
});

test('every computed region of docs/index.html is current, the static hero included', () => {
  assert.equal(html, buildPage(html, data), 'run: npm run docs-data');
  const hero = regions(data).manuscript;
  assert.ok(html.includes(hero));
  assert.equal(hero, renderManuscript(analyze(data.sample.text), data.sample.text), 'the static hero is what docs/lib computes in the browser');
});

test('the static hero carries one margin note per finding and underlines only text the report matched', () => {
  const report = analyze(data.sample.text);
  const hero = regions(data).manuscript;
  assert.equal((hero.match(/<li class="fx"/g) ?? []).length, report.totals.findings);
  const matches = report.rules.flatMap((r) => r.findings.filter((f) => !f.aggregate).map((f) => f.match));
  const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const marked = [...hero.matchAll(/<mark>([\s\S]*?)<\/mark>/g)].map((m) => unescape(m[1]));
  assert.ok(marked.length > 0);
  for (const m of marked) assert.ok(matches.some((x) => x.includes(m) || m.includes(x)), `underlined text is not a finding: ${m}`);
});

test('the page states the limits, the in-sample disclosure and the caveat in the words of their owners', () => {
  const text = html.replace(/<[^>]+>/g, '');
  for (const l of LIMITS) assert.ok(text.split(l.replace(/&/g, '&amp;')).length >= 3, `limit shown under the results and in the statement: ${l}`);
  assert.ok(read('README.md').includes(data.inSample));
  assert.ok(html.includes('The rates below are in-sample.'));
  assert.ok(html.includes(data.caveat));
  for (const r of RULES) assert.ok(html.includes(`id="rule-${r.id}"`), `rules index lists ${r.id}`);
  assert.ok(html.includes("Rule catalogue draws on Wikipedia's"));
});

test('NO NETWORK: the page loads nothing from another origin and its scripts cannot call out', () => {
  const loads = [...html.matchAll(/<(?:script|link|img|source|iframe|video|audio)\b[^>]*?\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(loads.length >= 4);
  for (const u of loads) assert.ok(!/^(?:[a-z]+:)?\/\//i.test(u), `loads from elsewhere: ${u}`);
  assert.match(html, /connect-src 'none'/);
  const css = read('docs', 'style.css');
  for (const m of css.matchAll(/url\(([^)]+)\)/g)) assert.match(m[1], /^fonts\//);
  assert.ok(!/@import/.test(css));
  for (const f of ['app.mjs', 'page.mjs']) {
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|new Image|import\s*\(/.test(read('docs', f)), `${f} can reach the network`);
  }
});

test('COPY RULES on the page chrome: dashes appear only inside regions that quote a sample', () => {
  const quoted = ['manuscript', 'textarea', 'results', 'audit'];
  let chrome = html;
  for (const name of quoted) {
    const a = chrome.indexOf(`<!-- gen:${name} -->`);
    const b = chrome.indexOf(`<!-- /gen:${name} -->`);
    assert.ok(a > -1 && b > a);
    chrome = chrome.slice(0, a) + chrome.slice(b);
  }
  assert.deepEqual(nonAscii(chrome), []);
  for (const f of ['style.css', 'app.mjs', 'page.mjs']) assert.deepEqual(nonAscii(read('docs', f)), [], f);
});
