/**
 * page.mjs: every piece of the showcase page that is computed, as pure
 * functions from data to an HTML string. No DOM, no node: builtin.
 *
 * Two callers use the same functions, so they cannot disagree:
 *
 *   scripts/build-docs-data.mjs  stamps the output into docs/index.html, so
 *                                the first paint has content, nothing shifts
 *                                and the page reads without JavaScript
 *   docs/app.mjs                 runs them again in the browser over a report
 *                                it computes on load with docs/lib
 *
 * The underlines, the margin numbers and every figure come from a
 * tells/report@1 or from docs/data.js. Nothing here types a number.
 */

import { analyze, audit, formatAudit, RULES, LIMITS, LIMITS_SOURCE } from './lib/index.mjs';
import { parseDocument } from './lib/document.mjs';
import { effectiveWeight } from './lib/report.mjs';

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const RANK = { weak: 0, moderate: 1, strong: 2 };
const REVEAL_MS = 1600;
export const MAX_LISTED = 40;

/** Minimal inline Markdown for paragraphs lifted from the README: code and bold. */
export const inlineMd = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

/* ------------------------------------------------------------------ */
/* The manuscript                                                      */
/* ------------------------------------------------------------------ */

/** Findings in reading order, numbered from 1, each with its effective weight. */
export function numbered(report) {
  const all = [];
  for (const r of report.rules) {
    for (const f of r.findings) all.push({ ...f, rule: r.id, w: effectiveWeight(r, f) });
  }
  all.sort((a, b) => a.offset - b.offset || a.length - b.length);
  all.forEach((f, i) => { f.n = i + 1; });
  return all;
}

function spansOf(inline) {
  const spans = [];
  for (const f of inline) {
    const last = spans[spans.length - 1];
    if (last && f.offset < last.end) {
      last.end = Math.max(last.end, f.offset + f.length);
      last.items.push(f);
    } else {
      spans.push({ start: f.offset, end: f.offset + f.length, items: [f] });
    }
  }
  return spans;
}

function blocksOf(doc) {
  const blocks = [];
  let start = null;
  doc.lines.forEach((l, i) => {
    const blank = doc.raw.slice(l.start, l.end).trim() === '';
    if (!blank && start === null) start = i;
    if (start !== null && (blank || i === doc.lines.length - 1)) {
      const lastLine = blank ? i - 1 : i;
      blocks.push({ firstLine: start + 1, start: doc.lines[start].start, end: doc.lines[lastLine].end });
      start = null;
    }
  });
  return blocks;
}

/**
 * The annotated text. Each block of the source is set twice in the same box:
 * a lower layer that carries only the underlines, and the text itself on
 * top. The lower layer is what fades in, so a finding can appear by opacity
 * alone and the words never move or dim.
 */
export function renderManuscript(report, text) {
  const doc = parseDocument(text, { plain: !!report.options?.plain });
  const all = numbered(report);
  const spans = spansOf(all.filter((f) => !f.aggregate));
  const step = all.length ? Math.round(REVEAL_MS / all.length) : 0;

  const rows = blocksOf(doc).map((b) => {
    let under = '';
    let over = '';
    let at = b.start;
    for (const s of spans) {
      if (s.end <= b.start || s.start >= b.end) continue;
      const from = Math.max(s.start, b.start);
      const to = Math.min(s.end, b.end);
      const plain = esc(doc.raw.slice(at, from));
      const hit = esc(doc.raw.slice(from, to));
      const weight = s.items.reduce((w, f) => (RANK[f.w] > RANK[w] ? f.w : w), 'weak');
      const mine = s.items.filter((f) => f.offset >= b.start);
      const nums = mine.map((f) => f.n).join(',');
      // Each number is a link to its note and is described by it, so a
      // keyboard reaches the note from the mark and a screen reader reads
      // "heading-style, weak, 1:3, title-case" on the mark itself.
      const links = mine.map((f) => `<a href="#note-${f.n}" aria-describedby="note-${f.n}">${f.n}</a>`).join(',');
      const i = s.items[0].n - 1;
      under += `${plain}<span class="u ${weight} fx" style="--i:${i}">${hit}</span>${nums ? `<sup>${nums}</sup>` : ''}`;
      over += `${plain}<mark>${hit}</mark>${nums ? `<sup class="fx" style="--i:${i}">${links}</sup>` : ''}`;
      at = to;
    }
    const tail = esc(doc.raw.slice(at, b.end));
    const notes = all.filter((f) => f.offset >= b.start && f.offset < b.end);
    const list = notes.map((f) => `<li class="fx" style="--i:${f.n - 1}" value="${f.n}" id="note-${f.n}"><b>${f.n}</b><span><code>${esc(f.rule)}</code> <i>${f.w}${f.aggregate ? ', whole block' : ''}, ${f.line}:${f.col}</i>${f.note ? ` ${esc(f.note)}` : ''}</span></li>`).join('');
    const heading = doc.raw[b.start] === '#';
    return { notes: notes.length, html: `<div class="ms-row${heading ? ' is-heading' : ''}"><div class="ms-text"><span class="ms-ln" aria-hidden="true">${b.firstLine}</span><div class="ms-stack"><p class="ms-layer ms-under" aria-hidden="true">${under}${tail}</p><p class="ms-layer ms-over">${over}${tail}</p></div></div>${list ? `<ol class="ms-notes">${list}</ol>` : ''}</div>` };
  });

  // The whole sample is about 27,000 px of phone. The first blocks make the
  // point; the rest is one keystroke away and is in the DOM either way, so
  // nothing is hidden from a reader who searches the page or prints it.
  const head = Math.max(1, Math.round(rows.length * HERO_SHARE));
  const rest = rows.slice(head);
  const hidden = rest.reduce((k, r) => k + r.notes, 0);
  const sheet = (list) => `<div class="ms-sheet" style="--step:${step}ms">${list.map((r) => r.html).join('')}</div>`;
  if (!rest.length) return sheet(rows);
  return `${sheet(rows.slice(0, head))}<details class="ms-more"><summary>Show the whole sample: ${n(rest.length, 'more block')}, ${n(hidden, 'more finding')}</summary>${sheet(rest)}</details>`;
}

/** How much of the sample the hero shows before the rest goes behind a details. */
export const HERO_SHARE = 0.4;

/**
 * The lines under the manuscript. Three things a reader needs and one thing
 * the demo owes them: the first note on this sample is the canonical false
 * positive of the rule that raised it, so the key says so rather than letting
 * the demo open on a finding a careful reader would call wrong.
 */
export function renderManuscriptKey(report) {
  const t = report.totals;
  const first = numbered(report)[0];
  const rule = first ? RULES.find((r) => r.id === first.rule) : null;
  const cut = rule ? rule.description.indexOf('False positive:') : -1;
  const fp = cut > -1 ? rule.description.slice(cut + 'False positive:'.length).trim() : '';
  const lead = first && fp
    ? `<p class="ms-key">Note ${first.n} is <code>${esc(first.rule)}</code>, and the rule names this as its own false positive: ${esc(fp.replace(/\.\s[\s\S]*$/, '.'))} A finding is a place to look.</p>`
    : '';
  return `${lead}<p class="ms-key">${n(t.findings, 'finding')} in ${n(t.rulesTriggered, 'rule')}, ${n(report.document.words, 'word')}. Underline style is the rule's weight: <span class="key-u weak">dotted weak</span>, <span class="key-u moderate">solid moderate</span>, <span class="key-u strong">double strong</span>. Numbers are line:column, counted in the unwrapped source line, so a column will not match anything you can count on a wrapped screen.</p>`;
}

/* ------------------------------------------------------------------ */
/* The live panel                                                      */
/* ------------------------------------------------------------------ */

const n = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

export function renderSummary(report) {
  const d = report.document;
  const t = report.totals;
  const line = `${n(d.words, 'word')}, ${n(d.sentences, 'sentence')}, ${n(d.paragraphs, 'paragraph')}. ${n(t.findings, 'finding')} in ${t.rulesTriggered} of ${report.rules.length} rules.`;
  const short = report.rates.reliable ? '' : `<p class="notice" role="note"><strong>Short text.</strong> ${esc(report.rates.note)}.</p>`;
  return `<p class="summary">${line} Rules overlap, so the tally is not a measurement.</p>${short}`;
}

const marker = (r) => (r.aboveBaseline === true ? 'above baseline' : r.aboveBaseline === false ? 'not above' : '');

export function renderRuleTable(report) {
  const head = '<div class="rt-row rt-head" role="row"><span role="columnheader" class="c-rule">rule</span><span role="columnheader" class="c-w">weight</span><span role="columnheader" class="c-n">count</span><span role="columnheader" class="c-r">per 1k</span><span role="columnheader" class="c-b">published baseline</span><span role="columnheader" class="c-m">against it</span></div>';
  const rows = report.rules.map((r) => {
    const base = r.baseline ? `${r.baseline.per1k} per 1k, ${esc(r.baseline.label)}` : 'none published';
    const cls = `${r.count ? '' : ' is-zero'}${r.aboveBaseline === true ? ' is-above' : ''}`;
    return `<div class="rt-row${cls}" role="row"><span role="cell" class="c-rule"><code>${esc(r.id)}</code></span><span role="cell" class="c-w">${r.weight}</span><span role="cell" class="c-n">${r.count}</span><span role="cell" class="c-r">${r.per1k.toFixed(2)}</span><span role="cell" class="c-b${r.baseline ? '' : ' no-base'}">${base}</span><span role="cell" class="c-m">${marker(r)}</span></div>`;
  }).join('');
  return `<div class="rt" role="table" aria-label="Count and rate for every rule">${head}${rows}</div>`;
}

function excerptHtml(f) {
  const ex = f.excerpt ?? '';
  const at = f.match ? ex.indexOf(f.match) : -1;
  if (at < 0) return `<mark>${esc(f.match ?? '')}</mark>`;
  return `${esc(ex.slice(0, at))}<mark>${esc(f.match)}</mark>${esc(ex.slice(at + f.match.length))}`;
}

export function renderFindings(report) {
  const groups = report.rules.filter((r) => r.count > 0).map((r) => {
    const shown = r.findings.slice(0, MAX_LISTED);
    const items = shown.map((f) => `<li><span class="loc">${f.line}:${f.col}</span><span class="ex">${excerptHtml(f)}</span></li>`).join('');
    const more = r.findings.length > shown.length ? `<p class="more">${r.findings.length - shown.length} more not listed here. The CLI prints all of them.</p>` : '';
    return `<section class="fg"><h4><code>${esc(r.id)}</code> <span>${esc(r.name)}, ${r.weight}, ${r.count} counted</span></h4><ol>${items}</ol>${more}</section>`;
  });
  if (!groups.length) return '<p class="empty">No rule matched this text. That is a count of zero, not a statement about who wrote it.</p>';
  return groups.join('');
}

export function renderResults(report) {
  return `${renderSummary(report)}${renderRuleTable(report)}<h3 class="sub">Findings, grouped by rule</h3><div class="findings" data-sample>${renderFindings(report)}</div>`;
}

/* ------------------------------------------------------------------ */
/* Limits                                                              */
/* ------------------------------------------------------------------ */

export function renderLimitsCompact() {
  return `<aside class="limits" aria-labelledby="limits-compact"><h3 id="limits-compact">Limits of every count above</h3><ol>${LIMITS.map((l) => `<li>${esc(l)}</li>`).join('')}</ol><p>Source: <a href="${esc(LIMITS_SOURCE.url)}">${esc(LIMITS_SOURCE.label)}</a></p></aside>`;
}

export function renderLimitsStatement() {
  const big = (l) => esc(l).replace(/(\d+%)/, '<strong>$1</strong>');
  return `<ol class="statements">${LIMITS.map((l) => `<li><span>${big(l)}</span></li>`).join('')}</ol><p class="statement-source">The figure is from <a href="${esc(LIMITS_SOURCE.url)}">${esc(LIMITS_SOURCE.label)}</a>.</p>`;
}

/* ------------------------------------------------------------------ */
/* Rules index                                                         */
/* ------------------------------------------------------------------ */

/**
 * One line per rule, with the description, the false-positive note and the
 * sources behind a native <details>.
 *
 * Eighteen rules printed in full made the phone page 27,892 px tall, about
 * thirty-five screens. <details> is keyboard reachable and searchable without
 * any script; docs/app.mjs opens them all at 900 px and wider, where there is
 * room, and the page is correct with the script never running.
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

/* ------------------------------------------------------------------ */
/* Corpus                                                              */
/* ------------------------------------------------------------------ */

const one = (n) => n.toFixed(1);
const codeList = (ids) => ids.map((id) => `<code>${esc(id)}</code>`).join(', ');

/** The plain statements, every number from data.facts. */
export function renderFacts(data) {
  const k = data.facts;
  const author = data.manifest.find((m) => m.id === k.dashTop.id)?.author ?? k.dashTop.id;
  return `<ul class="facts">
<li><strong>${one(k.dashTop.per1k)} per 1,000 words</strong> is the highest dash rate in the corpus, and it belongs to a ${esc(k.dashTop.kind)}: ${esc(author)}, <code>${esc(k.dashTop.id)}</code>. The published figure for ${esc(k.dashPublishedMachine.label)} is ${k.dashPublishedMachine.per1k}. The machine files here run from ${one(k.dashMachine.min)} to ${one(k.dashMachine.max)}. Dash density does not identify an author.</li>
<li><strong>${k.overlap.length} of ${k.rules} rules</strong> have a top human rate that reaches or passes the lowest machine rate: ${codeList(k.overlap)}. For those a rate separates nothing, even in-sample.</li>
<li><strong>${k.silent.length} rules</strong> fired on no file: ${codeList(k.silent)}. This corpus says nothing about them.</li>
<li><strong>${k.evasion.findings} findings in ${k.evasion.words} words</strong> is all the rules found in <code>${esc(k.evasion.id)}</code>, a machine text written by an author who had read the rule list. Anyone who knows the rules can write around them.</li>
</ul>`;
}

const CH = { w: 200, h: 150, left: 24, top: 8, bottom: 122, bar: 9, gap: 2, group: 9 };

function chart(ruleId, files, yMax, rule) {
  const y = (v) => CH.bottom - (Math.min(v, yMax) / yMax) * (CH.bottom - CH.top);
  let x = CH.left + 4;
  let prev = null;
  const groups = [];
  const bars = files.map((f) => {
    if (prev && prev !== f.kind) x += CH.group;
    if (prev !== f.kind) groups.push({ kind: f.kind, from: x });
    prev = f.kind;
    const v = f.rates[ruleId].per1k;
    const top = v > 0 ? Math.min(y(v), CH.bottom - 1.5) : CH.bottom - 1.5;
    const rect = `<rect class="bar ${f.kind}${v > 0 ? '' : ' zero'}" x="${x}" y="${top.toFixed(1)}" width="${CH.bar}" height="${(CH.bottom - top).toFixed(1)}"${f.kind === 'hybrid' && v > 0 ? ' fill="url(#hatch)"' : ''}><title>${esc(f.id)} (${f.kind}): ${one(v)} per 1k, ${f.rates[ruleId].count} counted in ${f.words} words</title></rect>`;
    groups[groups.length - 1].to = x + CH.bar;
    x += CH.bar + CH.gap;
    return rect;
  }).join('');
  const refs = rule?.baseline
    ? [{ v: rule.baseline.per1k, c: 'ref-human' }, ...(rule.baseline.machine ?? []).map((m) => ({ v: m.per1k, c: 'ref-machine' }))]
      .map((r) => `<line class="ref ${r.c}" x1="${CH.left}" x2="${CH.w - 2}" y1="${y(r.v).toFixed(1)}" y2="${y(r.v).toFixed(1)}"/>`).join('')
    : '';
  const labels = groups.map((g) => `<text class="gl" x="${((g.from + g.to) / 2).toFixed(1)}" y="${CH.bottom + 15}" text-anchor="middle">${g.kind === 'hybrid' ? 'hyb.' : g.kind}</text>`).join('');
  const topFile = [...files].sort((a, b) => b.rates[ruleId].per1k - a.rates[ruleId].per1k)[0];
  const topV = topFile.rates[ruleId].per1k;
  const cap = topV > 0 ? `top ${one(topV)}, ${esc(topFile.id)} (${topFile.kind})` : 'no finding in any file';
  const refCap = rule?.baseline ? `<span class="cap-ref">Dashed lines: ${rule.baseline.per1k} human baseline${(rule.baseline.machine ?? []).map((m) => `, ${m.per1k} ${esc(m.label.split(' (')[0].split(' on ')[0])}`).join('')}.</span>` : '';
  return `<figure class="sm"><svg viewBox="0 0 ${CH.w} ${CH.h}" role="img" aria-label="${esc(ruleId)}: ${cap}"><text class="yl" x="${CH.left - 4}" y="${CH.top + 4}" text-anchor="end">${yMax}</text><text class="yl" x="${CH.left - 4}" y="${CH.bottom + 1}" text-anchor="end">0</text><line class="axis" x1="${CH.left}" x2="${CH.w - 2}" y1="${CH.bottom}" y2="${CH.bottom}"/><line class="axis faint" x1="${CH.left}" x2="${CH.w - 2}" y1="${CH.top}" y2="${CH.top}"/>${refs}${bars}${labels}</svg><figcaption><code>${esc(ruleId)}</code><span>${cap}</span>${refCap}</figcaption></figure>`;
}

export function renderCorpus(data) {
  const c = data.corpus;
  const max = Math.max(...c.files.flatMap((f) => c.ruleIds.map((id) => f.rates[id].per1k)));
  const yMax = Math.ceil(max / 5) * 5;
  const counts = c.files.reduce((n, f) => ({ ...n, [f.kind]: (n[f.kind] ?? 0) + 1 }), {});
  const legend = `<p class="legend"><span><svg viewBox="0 0 12 12" aria-hidden="true"><rect class="bar human" width="12" height="12"/></svg>human, ${counts.human} files</span><span><svg viewBox="0 0 12 12" aria-hidden="true"><rect class="bar machine" width="12" height="12"/></svg>machine, ${counts.machine} files</span><span><svg viewBox="0 0 12 12" aria-hidden="true"><rect class="bar hybrid" width="12" height="12" fill="url(#hatch)"/></svg>hybrid, ${counts.hybrid} files (hatched)</span><span>Every chart shares one scale: 0 to ${yMax} findings per 1,000 words.</span></p>`;
  const defs = '<svg class="defs" width="0" height="0" aria-hidden="true" focusable="false"><defs><pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="hatch-bg" width="4" height="4"/><line class="hatch-line" x1="0" y1="0" x2="0" y2="4"/></pattern></defs></svg>';
  const charts = c.ruleIds.map((id) => chart(id, c.files, yMax, RULES.find((r) => r.id === id))).join('');
  const order = `<p class="order">Files, left to right: ${c.files.map((f) => `<code>${esc(f.id)}</code>`).join(', ')}.</p>`;
  return `${defs}${legend}<div class="multiples">${charts}</div>${order}`;
}

/* ------------------------------------------------------------------ */
/* Use it                                                              */
/* ------------------------------------------------------------------ */

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
  return `<p>Constructed scenario: the report for the sample at the top of this page, with the <code>${esc(rule.id)}</code> finding at ${gone.line}:${gone.col} deleted and the count lowered to match. <code>tells audit</code> recomputes everything from the document and says:</p><pre class="out" tabindex="0" data-sample><code>${esc(out.trimEnd())}</code></pre>`;
}

/**
 * `owner/repo` from the repository URL, for the `npx github:` form. Derived
 * rather than typed, so the two can never name different repositories.
 */
const slug = (repository) => String(repository).replace(/^.*github\.com\//i, '').replace(/\.git$/, '').replace(/\/$/, '');

/**
 * Until the package is on npm the page offers the command that works today,
 * which runs the tool straight from the public repository. Same shape as
 * falloff and disrepair, whose pages resolve this the same way; the earlier
 * clone-and-cd form was three steps and asserted the repository was not yet
 * public, which stops being true the moment it is.
 */
export function renderInstall(data) {
  const npm = data.npm;
  if (npm.published) return `<pre tabindex="0"><code>npm i ${esc(data.packageName)}\nnpx ${esc(data.packageName)} draft.md</code></pre>`;
  return `<pre tabindex="0"><code>npx github:${esc(slug(data.repository))} draft.md</code></pre><p>It is not on npm yet: <code>${esc(npm.command)}</code> returned ${esc(npm.result)} on ${esc(npm.checkedOn)}, so this runs it straight from the repository. Requires Node ${esc(data.node)}. Zero dependencies.</p>`;
}

export const installCommand = (data) => (data.npm.published ? `npm i ${data.packageName}` : `npx github:${slug(data.repository)}`);
