/**
 * app.mjs: the page's behaviour. It lints the sample on load with the copy of
 * the linter in ./lib, redraws the manuscript from that report, and runs the
 * same code over whatever is typed. It makes no network request of any kind:
 * no fetch, no beacon, no image, no font from elsewhere.
 */

import { analyze } from './lib/index.mjs';
import { TELLS_DATA as data } from './data.js';
import { renderManuscript, renderManuscriptKey, renderResults, esc } from './page.mjs';

const root = document.documentElement;
const $ = (id) => document.getElementById(id);

/* ---- theme ---- */

const themeButton = $('theme');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const currentTheme = () => root.getAttribute('data-theme') ?? (systemDark.matches ? 'dark' : 'light');
function labelTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  themeButton.textContent = next === 'dark' ? 'Dark' : 'Light';
  themeButton.setAttribute('aria-label', `Switch to the ${next} theme`);
}
themeButton.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try { localStorage.setItem('tells-theme', next); } catch { /* private window: the choice lasts for this visit */ }
  labelTheme();
});
systemDark.addEventListener('change', labelTheme);
labelTheme();

/* ---- the manuscript: computed here, on load ---- */

const sampleReport = analyze(data.sample.text);
const manuscript = $('manuscript');
manuscript.innerHTML = renderManuscript(sampleReport, data.sample.text);
$('manuscript-key').innerHTML = `${renderManuscriptKey(sampleReport)}<p class="ms-caption">${esc(data.sample.caption)}</p>`;
manuscript.setAttribute('data-computed', String(sampleReport.totals.findings));
// Two frames, so the hidden state is painted once before it is released.
requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('reveal-pending')));

/* ---- the rules index ---- */

// Collapsed in the markup, because eighteen rules printed in full made the
// phone page about thirty-five screens tall. On a wide screen there is room,
// so they open. Without this script they stay collapsed and still work: a
// <details> needs no JavaScript and is reachable from the keyboard.
const wide = window.matchMedia('(min-width: 900px)');
const openRules = () => {
  for (const d of document.querySelectorAll('.rules > details')) d.open = wide.matches;
};
openRules();
wide.addEventListener('change', openRules);

/* ---- the live panel ---- */

const input = $('input');
const results = $('results');
const loaded = $('loaded');
let timer = 0;

function run() {
  const report = analyze(input.value);
  results.innerHTML = renderResults(report);
  results.setAttribute('data-words', String(report.document.words));
}
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(run, 150);
}
function load(text, caption) {
  input.value = text;
  loaded.textContent = caption;
  clearTimeout(timer);
  run();
  input.focus();
}

input.addEventListener('input', () => { loaded.textContent = ''; schedule(); });
$('clear').addEventListener('click', () => load('', 'Cleared. Paste or type your own text.'));
$('load-human').addEventListener('click', () => load(data.humanSample.text, data.humanSample.caption));
$('load-machine').addEventListener('click', () => load(data.sample.text, data.sample.caption));
// A reload can restore what was typed before; the results should match it.
if (input.value !== data.sample.text) run();

/* ---- copy ---- */

const copy = $('copy');
copy.addEventListener('click', async () => {
  const text = document.querySelector(copy.dataset.copy).textContent;
  try {
    await navigator.clipboard.writeText(text);
    copy.textContent = 'Copied';
  } catch {
    copy.textContent = 'Select it';
    const range = document.createRange();
    range.selectNodeContents(document.querySelector(copy.dataset.copy));
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
  setTimeout(() => { copy.textContent = 'Copy'; }, 1600);
});
