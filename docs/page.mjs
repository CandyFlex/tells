/**
 * page.mjs: every piece of the showcase pages that is computed, as pure
 * functions from data to an HTML string. No DOM, no node: builtin.
 *
 * Two callers use the same functions, so they cannot disagree:
 *
 *   scripts/build-docs-data.mjs  stamps the output into docs/index.html and
 *                                docs/rules.html, so the first paint has
 *                                content and the pages read without JavaScript
 *   docs/app.mjs                 runs the Try it renderers again in the
 *                                browser over whatever is typed
 *
 * Every location, weight, count and rate comes from a tells/report@1 or from
 * docs/data.js. Nothing here types a number.
 */

import { analyze, audit, formatAudit, RULES, LIMITS, LIMITS_SOURCE, MIN_WORDS_FOR_RATES } from './lib/index.mjs';

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Minimal inline Markdown for paragraphs lifted from the README: code and bold. */
export const inlineMd = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

const LEVEL = { weak: 1, moderate: 2, strong: 3 };
const all = (report) => report.rules.flatMap((r) => (r.findings ?? []).filter((f) => !f.aggregate).map((f) => ({ ...f, rule: r.id, weight: r.weight })));
const one = (n) => (Math.sign(n) * Math.round(Math.abs(n) * 10) / 10).toFixed(1).replace(/\.0$/, '');

/* ------------------------------------------------------------------ */
/* Sentences from the sample                                           */
/* ------------------------------------------------------------------ */

/** The sentence around an offset: back to the last stop or line start, on to the next stop. */
function sentenceAt(text, offset) {
  let a = offset;
  while (a > 0 && text[a - 1] !== '\n' && !(/[.!?]/.test(text[a - 2] ?? '') && text[a - 1] === ' ')) a--;
  let b = offset;
  while (b < text.length && text[b] !== '\n' && !(/[.!?]/.test(text[b]) && (b + 1 === text.length || /\s/.test(text[b + 1])))) b++;
  return [a, Math.min(text.length, b + 1)];
}

/**
 * The findings the hero performs, chosen by rule and line. The choice is the
 * page's; everything shown about each one (match, column, weight) is the
 * report's. A pick the report no longer contains is dropped, and a test fails
 * when that happens.
 */
export const HERO_PICKS = [
  { rule: 'em-dash', line: 5 },
  { rule: 'puffery', line: 7, match: 'Nestled' },
  { rule: 'vocabulary', line: 7 },
  { rule: 'negative-parallelism', line: 11 },
];

export function heroFindings(report) {
  const found = all(report);
  return HERO_PICKS.map((p) => found.find((f) => f.rule === p.rule && f.line === p.line && (!p.match || f.match === p.match))).filter(Boolean);
}

/** Sentences holding the given findings, in text order, each with its findings. */
function sentencesFor(text, findings) {
  const out = [];
  for (const f of [...findings].sort((x, y) => x.offset - y.offset)) {
    const [a, b] = sentenceAt(text, f.offset);
    let s = out.find((o) => o.a === a);
    if (!s) out.push(s = { a, b, marks: [] });
    s.marks.push(f);
  }
  return out;
}

/** One sentence with non-overlapping spans wrapped by `wrap(finding, innerHtml)`. */
function markSentence(text, s, wrap) {
  let html = '', at = s.a;
  for (const f of [...s.marks].sort((x, y) => x.offset - y.offset)) {
    if (f.offset < at) continue;
    html += esc(text.slice(at, f.offset)) + wrap(f, esc(text.slice(f.offset, f.offset + f.length)));
    at = f.offset + f.length;
  }
  return html + esc(text.slice(at, s.b).trimEnd());
}

/* ------------------------------------------------------------------ */
/* Hero: sentences from the sample, the findings stepped through       */
/* ------------------------------------------------------------------ */

export function renderHero(report, text) {
  let i = 0;
  const note = (f) => `<span class="note"><span class="rule-n">${esc(f.rule)}</span><span class="at">${f.line}:${f.col}</span><span class="w">${esc(f.weight)}</span></span>`;
  return sentencesFor(text, heroFindings(report))
    .map((s) => `<p>${markSentence(text, s, (f, inner) => `<span class="mk" style="--i:${i++}">${inner}${note(f)}</span>`)}</p>`).join('');
}

/* ------------------------------------------------------------------ */
/* Anatomy: one finding taken apart                                    */
/* ------------------------------------------------------------------ */

export function renderAnatomy(report, text, ruleId = 'vocabulary') {
  const rule = report.rules.find((r) => r.id === ruleId);
  const f = rule.findings.find((x) => !x.aggregate);
  const [a, b] = sentenceAt(text, f.offset);
  const before = text.slice(a, f.offset).split(/\s+/).filter(Boolean).slice(-6).join(' ');
  const after = text.slice(f.offset + f.length, b).trim().split(/\s+/).slice(0, 2).join(' ').replace(/[,.;:]$/, '');
  const rate = rule.per1k == null ? '' : ` &middot; ${rule.per1k}/1k`;
  const src = `<p class="anat-src" data-sample>&hellip;${esc(before)} <mark class="w-${rule.weight}">${esc(f.match)}</mark> ${esc(after)}&hellip;</p>`;
  const dim = '<div class="dim">'
    + `<div><b class="acc">${esc(rule.id)}</b><u>Rule</u><span>Which pattern matched, by name.</span></div>`
    + `<div><b>${f.line}:${f.col}</b><u>Line : column</u><span>Where it is. Go straight to it.</span></div>`
    + `<div><b>${esc(rule.weight)}</b><u>Weight</u><span>How much one hit means alone.</span></div>`
    + `<div><b>${rule.count}${rate}</b><u>Count and rate</u><span>For this rule in this file. Never added up.</span></div></div>`;
  return `${src}<div class="anat-drop" aria-hidden="true"></div>${dim}`;
}

/** The first span two rules both counted, which is why counts are never summed. */
export function renderOverlap(report) {
  const found = all(report);
  for (const f of found) {
    const other = found.find((g) => g.rule !== f.rule && g.offset === f.offset && g.length === f.length);
    if (other) {
      const word = f.match.charAt(0).toUpperCase() + f.match.slice(1);
      return `Rules overlap. <b>&ldquo;${esc(word)}&rdquo; is counted by both <code class="i">${esc(f.rule)}</code> and <code class="i">${esc(other.rule)}</code></b>, which is why the counts are never summed into one number.`;
    }
  }
  return 'Rules overlap: one phrase can be counted by more than one rule, which is why the counts are never summed into one number.';
}

/* ------------------------------------------------------------------ */
/* The difference: the same sentences, unmarked and marked             */
/* ------------------------------------------------------------------ */

export function renderVersus(report, text) {
  const found = all(report);
  const sents = sentencesFor(text, heroFindings(report).slice(1))
    .map((s) => ({ ...s, marks: found.filter((f) => f.offset >= s.a && f.offset < s.b) }));
  const plain = sents.map((s) => `<p>${esc(text.slice(s.a, s.b).trimEnd())}</p>`).join('');
  const marked = sents.map((s) => {
    // Keep the outermost span where two overlap, weighted by the heavier.
    const spans = [];
    for (const f of [...s.marks].sort((x, y) => x.offset - y.offset || y.length - x.length)) {
      const last = spans[spans.length - 1];
      if (last && f.offset < last.offset + last.length) { if (LEVEL[f.weight] > LEVEL[last.weight]) last.weight = f.weight; continue; }
      spans.push({ ...f });
    }
    return `<p>${markSentence(text, { ...s, marks: spans }, (f, inner) => `<mark class="w-${f.weight}">${inner}</mark>`)}</p>`;
  }).join('');
  const locs = sents.flatMap((s) => s.marks).sort((x, y) => x.offset - y.offset || x.rule.localeCompare(y.rule))
    .map((f) => `<div><i>${f.line}:${f.col}</i><code>${esc(f.rule)}</code><span>${esc(f.weight)}</span></div>`).join('');
  return `<div class="versus" data-sample>
      <div class="pane them">
        <h3>A detector</h3>
        <div class="txt">${plain}</div>
        <div class="out"><div class="stamp"><b>Likely AI</b><span>one verdict, whole document</span></div><p>It does not say which sentence, or why. (The shape of what a detector hands back, not a real run.)</p></div>
      </div>
      <div class="pane us">
        <h3>Tells</h3>
        <div class="txt">${marked}</div>
        <div class="out locs">${locs}</div>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Try it: the mirror under the textarea, and the findings list        */
/* ------------------------------------------------------------------ */

/** Marks for the mirror. Rules overlap, so each character takes the heaviest weight covering it. */
export function renderMirror(report, text, hot = null) {
  const n = text.length;
  const lv = new Uint8Array(n);
  for (const f of report ? all(report) : []) {
    const w = LEVEL[f.weight] ?? 1;
    for (let i = f.offset; i < Math.min(n, f.offset + f.length); i++) if (lv[i] < w) lv[i] = w;
  }
  let html = '';
  for (let i = 0; i < n;) {
    let j = i;
    while (j < n && lv[j] === lv[i]) j++;
    const chunk = esc(text.slice(i, j));
    html += lv[i] ? `<span class="w${lv[i]}${hot && i < hot[1] && j > hot[0] ? ' hot' : ''}">${chunk}</span>` : chunk;
    i = j;
  }
  // A trailing newline in a textarea still takes a line; the mirror must match it.
  return `${html}\n\u{200B}`;
}

export function renderTryResults(report, open = ['vocabulary']) {
  if (!report) return '<div class="sum"><div class="big">0</div><p>Paste some text to see findings.</p></div><ul class="rl"></ul>';
  const hit = report.rules.filter((r) => r.count > 0);
  if (!hit.length) return '<div class="sum"><div class="big">0<small>findings</small></div><p>No rule matched. That says nothing about who wrote it.</p></div><ul class="rl"></ul>';
  hit.sort((a, b) => (LEVEL[b.weight] - LEVEL[a.weight]) || (b.count - a.count));
  const total = hit.reduce((s, r) => s + r.count, 0);
  const rates = report.document.words >= MIN_WORDS_FOR_RATES;
  const sum = `<div class="sum"><div class="big">${total}<small>findings from ${hit.length} rule${hit.length === 1 ? '' : 's'}</small></div>`
    + `<p>${rates ? 'Rates are per 1,000 words.' : `Rates need ${MIN_WORDS_FOR_RATES} words; counts only below that.`} Rules overlap, so no total score.</p></div>`;
  const list = hit.map((r) => {
    const isOpen = open.includes(r.id);
    const items = r.findings.filter((f) => !f.aggregate).map((f) =>
      `<li><button type="button" data-o="${f.offset}" data-l="${f.length}"><i>${f.line}:${f.col}</i><span>${esc(f.match)}</span></button></li>`).join('');
    const rate = rates && r.per1k != null ? ` &middot; ${r.per1k}/1k` : '';
    return `<li class="${isOpen ? 'open' : ''}" data-id="${esc(r.id)}"><button type="button" class="rh" aria-expanded="${isOpen}">`
      + `<code class="w-${r.weight}">${esc(r.id)}</code><span class="wt">${r.weight}</span><span class="ct"><b>${r.count}</b>${rate}</span></button><ol>${items}</ol></li>`;
  }).join('');
  return `${sum}<ul class="rl">${list}</ul>`;
}

/* ------------------------------------------------------------------ */
/* The gap: one diverging bar per rule                                 */
/* ------------------------------------------------------------------ */

/**
 * For each rule, the lowest rate in any machine file minus the highest in
 * any human file. Above zero, every machine file outscored every human one.
 * Machine means the files written without an avoidance instruction, the
 * same split the README uses.
 */
export function gapRows(corpus) {
  const evasion = corpus.evasion?.evasion;
  const human = corpus.files.filter((f) => f.kind === 'human');
  const machine = corpus.files.filter((f) => f.kind === 'machine' && f.id !== evasion);
  const drawn = corpus.files.filter((f) => f.kind !== 'hybrid');
  const rows = corpus.ruleIds.map((id) => {
    const hMax = Math.max(...human.map((f) => f.rates[id].per1k));
    const mMin = Math.min(...machine.map((f) => f.rates[id].per1k));
    return { id, hMax, mMin, gap: mMin - hMax, sep: mMin > hMax && mMin > 0, fired: drawn.some((f) => f.rates[id].per1k > 0) };
  });
  return { rows, humanFiles: human.length, machineFiles: machine.length };
}

const COUNT = ['No rule', 'Only one rule', 'Two rules', 'Three rules', 'Four rules', 'Five rules'];

export function renderGapHead(corpus) {
  const n = gapRows(corpus).rows.filter((r) => r.sep).length;
  return `<h2 class="t-sec" id="h-finding">${COUNT[n] ?? `${n} rules`} ${n === 1 ? 'clears' : 'clear'} the gap.</h2>`;
}

export function renderGap(corpus) {
  const { rows, humanFiles, machineFiles } = gapRows(corpus);
  const fired = rows.filter((r) => r.fired), silent = rows.filter((r) => !r.fired);
  const LO = Math.floor(Math.min(-5, ...fired.map((r) => r.gap)) / 5) * 5 - 2;
  const HI = Math.ceil(Math.max(5, ...fired.map((r) => r.gap)) / 5) * 5 + 1;
  const span = HI - LO, zero = (-LO / span) * 100, pos = (v) => ((v - LO) / span) * 100;
  const off = (id) => RULES.find((x) => x.id === id)?.historical;
  const body = [...fired].sort((a, b) => b.gap - a.gap).map((r) => {
    const bar = r.gap === 0 ? `<i class="va-pin" style="left:${zero.toFixed(2)}%"></i>`
      : `<i class="va-bar ${r.gap > 0 ? 'pos' : 'neg'}" style="left:${(r.gap > 0 ? zero : pos(r.gap)).toFixed(2)}%;width:${((Math.abs(r.gap) / span) * 100).toFixed(2)}%"></i>`;
    const note = r.gap > 0 ? `machine ${one(r.mMin)}+ vs human up to ${one(r.hMax)}`
      : r.gap === 0 ? 'machine files score 0 too' : `human up to ${one(r.hMax)}, machine from ${one(r.mMin)}`;
    return `<div class="va-row${r.sep ? ' sep' : ''}"><code>${esc(r.id)}${off(r.id) ? '*' : ''}</code><div class="va-track">${bar}</div><span class="va-v">${r.gap > 0 ? '+' : ''}${one(r.gap)}</span><span class="va-n">${note}</span></div>`;
  }).join('');
  const ticks = [];
  for (let t = Math.ceil(LO / 5) * 5; t <= HI; t += 5) ticks.push(`<span style="left:${pos(t).toFixed(2)}%">${t > 0 ? '+' : ''}${t}</span>`);
  const widest = [...fired].sort((a, b) => a.gap - b.gap)[0];
  const widestNote = widest && widest.gap < 0 ? ` <b>${one(widest.gap)}</b> on <code>${esc(widest.id)}</code>: a human file at ${one(widest.hMax)}, above every machine file.` : '';
  const star = fired.some((r) => off(r.id)) ? ' * off by default.' : '';
  const none = silent.length ? ` Not shown: ${silent.map((r) => `<code>${esc(r.id)}</code>`).join(', ')}, which fired on no file.` : '';
  return `<div class="va" role="img" aria-label="${fired.length} rules. Gap between the lowest machine rate and the highest human rate. Above zero: ${fired.filter((r) => r.sep).map((r) => r.id).join(', ') || 'none'}.">
    <div class="va-sides"><span></span><div class="va-lr" style="--z:${zero.toFixed(2)}%"><span>&larr; a human file reaches the machines</span><span>machines clear every human &rarr;</span></div></div>
    <div class="va-sides"><span></span><div class="va-ticks">${ticks.join('')}</div></div>
    <div class="va-rows">${body}</div>
    <p class="va-key">Findings per 1,000 words. ${humanFiles} human files, ${machineFiles} machine files.${widestNote}${star}${none}</p>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Limits                                                              */
/* ------------------------------------------------------------------ */

export function renderLimitsCompact() {
  return `<aside class="limits-compact" aria-labelledby="limits-compact"><h3 id="limits-compact">Limits of every count above</h3><ol>${LIMITS.map((l) => `<li>${esc(l)}</li>`).join('')}</ol><p>Source: <a href="${esc(LIMITS_SOURCE.url)}">${esc(LIMITS_SOURCE.label)}</a></p></aside>`;
}

export function renderLimitsStatement() {
  const big = (l) => esc(l).replace(/(\d+%)/, '<strong>$1</strong>');
  return `<ol class="cannot">${LIMITS.map((l) => `<li><b>${big(l)}</b></li>`).join('')}</ol><p class="statement-source">The figure is from <a href="${esc(LIMITS_SOURCE.url)}">${esc(LIMITS_SOURCE.label)}</a>.</p>`;
}

/* ------------------------------------------------------------------ */
/* Rules index (rules.html)                                            */
/* ------------------------------------------------------------------ */

/**
 * One line per rule, with the description, the false-positive note and the
 * sources behind a native <details>. docs/app.mjs opens them all at 900 px
 * and wider; the page is correct with the script never running.
 */
export function renderRulesIndex() {
  return `<div class="rules">${RULES.map((r) => {
    const cut = r.description.indexOf('False positive:');
    const what = cut > -1 ? r.description.slice(0, cut).trim() : r.description;
    const fp = cut > -1 ? r.description.slice(cut + 'False positive:'.length).trim() : '';
    const base = r.baseline
      ? `${r.baseline.per1k} per 1k, ${esc(r.baseline.label)}${[...(r.baseline.alt ?? []), ...(r.baseline.machine ?? [])].map((b) => `; ${b.per1k}, ${esc(b.label)}`).join('')}`
      : 'none published, so the report makes no comparison';
    const sources = r.source.map((s) => `<li><a href="${esc(s.url)}">${esc(s.label)}</a></li>`).join('');
    const off = r.historical ? `<span class="rule-off">off by default: <code>--include ${esc(r.id)}</code></span>` : '';
    return `<details class="rule" id="rule-${esc(r.id)}"><summary><code>${esc(r.id)}</code><span class="rule-name">${esc(r.name)}</span><span class="rule-w">${r.weight}, ${esc(r.category)}</span>${off}</summary><div class="rule-body"><div class="rule-what"><p>${esc(what)}</p>${fp ? `<p><b>False positive:</b> ${esc(fp)}</p>` : ''}</div><div class="rule-ref"><p><b>Baseline:</b> ${base}.</p><ul class="sources" aria-label="Sources for ${esc(r.id)}">${sources}</ul></div></div></details>`;
  }).join('')}</div>`;
}

/**
 * A constructed scenario: the sample's own report with one finding deleted
 * and the count fixed up to hide it, then audited against the sample.
 */
export function renderAuditExample(sampleText) {
  const report = JSON.parse(JSON.stringify(analyze(sampleText, { observedAt: '2026-09-19T00:00:00.000Z' })));
  const rule = report.rules.find((r) => r.count > 0);
  const gone = rule.findings.pop();
  rule.count -= 1;
  const out = formatAudit(audit(report, sampleText));
  return `<p>Constructed scenario: the report for the sample on the home page, with the <code>${esc(rule.id)}</code> finding at ${gone.line}:${gone.col} deleted and the count lowered to match. <code>tells audit</code> recomputes everything from the document and says:</p><pre class="out" tabindex="0" data-sample><code>${esc(out.trimEnd())}</code></pre>`;
}

/* ------------------------------------------------------------------ */
/* Use it                                                              */
/* ------------------------------------------------------------------ */

/**
 * `owner/repo` from the repository URL, for the `npx github:` form. Derived
 * rather than typed, so the two can never name different repositories.
 */
const slug = (repository) => String(repository).replace(/^.*github\.com\//i, '').replace(/\.git$/, '').replace(/\/$/, '');

/** Until the package is on npm, the command that works today runs it from the repository. */
export const installCommand = (data) => (data.npm.published ? `npx ${data.packageName}` : `npx github:${slug(data.repository)}`);

/** The Use it commands, all built from the one derived install command. */
export function renderUse(data) {
  const [k, ...rest] = installCommand(data).split(' ');
  const line = (args) => `<span class="k">${esc(k)}</span> ${esc([...rest, args].join(' '))}`;
  const code = `<pre class="code" tabindex="0"><span class="c"># check a file</span>
${line('draft.md')}

<span class="c"># fail a build on chat leftovers</span>
${line('draft.md --fail-on strong')}

<span class="c"># an annotated page you can read</span>
${line('render draft.md --out report.html')}</pre>`;
  const note = data.npm.published ? '' : `<p class="npm-note">Not on npm yet: <code>${esc(data.npm.command)}</code> returned ${esc(data.npm.result)} on ${esc(data.npm.checkedOn)}, so this runs it straight from the repository.</p>`;
  return code + note;
}
