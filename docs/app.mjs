/**
 * app.mjs: the behaviour of index.html and rules.html. It lints whatever is
 * typed with the copy of the linter in ./lib and redraws the Try it panel
 * with the same renderers the build used. It makes no network request of any
 * kind: no fetch, no beacon, no image, no font from elsewhere.
 */

import { analyze } from './lib/index.mjs';
import { TELLS_DATA as data } from './data.js';
import { renderMirror, renderTryResults } from './page.mjs';

const root = document.documentElement;
const $ = (id) => document.getElementById(id);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

/* ---- rules page: open every rule where there is room ---- */

// Collapsed in the markup, because eighteen rules printed in full make a
// phone page far too tall. Without this script they stay collapsed and still
// work: a <details> needs no JavaScript and is reachable from the keyboard.
const wide = window.matchMedia('(min-width: 900px)');
const openRules = () => { for (const d of document.querySelectorAll('.rules > details')) d.open = wide.matches; };
openRules();
wide.addEventListener('change', openRules);

/* ---- sections that animate play once, on first view ---- */

for (const sec of document.querySelectorAll('[data-anim]')) {
  new IntersectionObserver((entries, obs) => entries.forEach((e) => {
    if (e.isIntersecting) { sec.classList.add('on'); obs.disconnect(); }
  }), { threshold: 0.2 }).observe(sec);
}

/* ---- the hero: marks arrive in reading order, one note open at a time ---- */

const demo = $('demo');
if (demo) {
  const sheet = $('sheet');
  const marks = [...demo.querySelectorAll('.mk')];
  const beat = 1400;
  let timers = [];

  // A note that would run past the sheet's right edge hangs from the mark's right instead.
  const place = () => {
    const edge = sheet.getBoundingClientRect().right - 16;
    for (const m of marks) {
      const n = m.querySelector('.note');
      n.classList.remove('flip');
      if (m.getBoundingClientRect().left + n.offsetWidth > edge) n.classList.add('flip');
    }
  };
  const play = () => {
    timers.forEach(clearTimeout);
    timers = [];
    marks.forEach((m) => m.classList.remove('on'));
    demo.classList.remove('playing');
    demo.classList.add('reset');
    void demo.offsetWidth;
    demo.style.setProperty('--beat', `${beat}ms`);
    demo.classList.remove('reset');
    void demo.offsetWidth;
    demo.classList.add('playing');
    if (reduced) return;
    marks.forEach((m, i) => timers.push(setTimeout(() => {
      marks.forEach((o) => o.classList.remove('on'));
      m.classList.add('on');
    }, i * beat + 280)));
    timers.push(setTimeout(() => marks.forEach((o) => o.classList.remove('on')), (marks.length - 1) * beat + 2080));
  };
  $('again').addEventListener('click', play);
  window.addEventListener('resize', place, { passive: true });
  place();
  new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { place(); play(); } }), { threshold: 0.3 }).observe(demo);
}

/* ---- copy the install command ---- */

const copy = $('copy');
if (copy) {
  const label = copy.querySelector('u');
  copy.addEventListener('click', async () => {
    const text = document.querySelector(copy.dataset.copy).textContent;
    try {
      await navigator.clipboard.writeText(text);
      label.textContent = 'copied';
    } catch {
      label.textContent = 'select it';
      const range = document.createRange();
      range.selectNodeContents(document.querySelector(copy.dataset.copy));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    setTimeout(() => { label.textContent = 'copy'; }, 1600);
  });
}

/* ---- Try it ---- */

const input = $('input');
if (input) {
  const mirror = $('mirror'), results = $('results'), wc = $('wc'), loaded = $('loaded'), box = $('scroller');
  const open = new Set(['vocabulary']);
  let report = null, hot = null, timer = 0;

  const paint = () => { mirror.innerHTML = renderMirror(report, input.value, hot); };
  const run = () => {
    report = input.value.trim() ? analyze(input.value) : null;
    hot = null;
    paint();
    results.innerHTML = renderTryResults(report, [...open]);
    const words = report ? report.document.words : 0;
    wc.textContent = `${words.toLocaleString()} word${words === 1 ? '' : 's'}`;
  };
  const load = (text, caption) => {
    input.value = text;
    loaded.textContent = caption;
    box.scrollTop = 0;
    run();
  };

  // The mirror repaints at once so the text under the caret never lags; the lint waits for a pause.
  input.addEventListener('input', () => { report = null; paint(); clearTimeout(timer); timer = setTimeout(run, 160); });

  results.addEventListener('click', (e) => {
    const head = e.target.closest('.rh');
    if (head) {
      const li = head.parentElement, id = li.dataset.id;
      if (open.has(id)) open.delete(id); else open.add(id);
      li.classList.toggle('open');
      head.setAttribute('aria-expanded', String(open.has(id)));
      return;
    }
    const b = e.target.closest('button[data-o]');
    if (!b) return;
    const o = Number(b.dataset.o), l = Number(b.dataset.l);
    hot = [o, o + l];
    paint();
    input.focus({ preventScroll: true });
    input.setSelectionRange(o, o + l);
    // The editor scrolls inside its own box: bring the mark to its upper third.
    const mark = mirror.querySelector('.hot');
    if (mark) {
      const y = mark.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - box.clientHeight / 3;
      box.scrollTo({ top: Math.max(0, y), behavior: reduced ? 'auto' : 'smooth' });
      // On a phone the list sits below the editor: bring the editor back.
      if (box.getBoundingClientRect().bottom < 80) box.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }
  });

  $('load-sample').addEventListener('click', () => load(data.sample.text, data.sample.caption));
  $('load-human').addEventListener('click', () => load(data.humanSample.text, data.humanSample.caption));
  $('clear').addEventListener('click', () => { load('', 'Cleared. Paste or type your own text.'); input.focus(); });

  // A reload can restore what was typed before; the panel should match it.
  run();
}
