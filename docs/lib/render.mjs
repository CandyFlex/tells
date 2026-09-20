/**
 * render.mjs: a document with its findings underlined and explained in the
 * margin. One self-contained HTML string: inline CSS, no script, no network
 * request, light and dark.
 *
 * The page is laid out as rows. Each row is one block of the source text
 * (split on blank lines) beside the notes for that block, so a note is always
 * level with the words it is about. Below 900px the notes drop under their
 * block. The source is shown as written, Markdown marks and all, because the
 * line and column numbers refer to that text and nothing else.
 *
 * Nothing on the page is a judgement. Weight is drawn as underline style
 * (dotted, solid, double) so it survives greyscale printing and colour
 * blindness, and the limits block is printed above the text, not after it.
 *
 * Pure: takes a report and the document string, returns a string. The
 * underlines come from the report's offsets, so a page rendered from an
 * audited report shows exactly what the audit verified.
 */

import { parseDocument } from './document.mjs';
import { effectiveWeight } from './report.mjs';
import { baselineText, optionsText, partialRunText, totalsText } from './format.mjs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `
:root{--bg:#f6f3ec;--paper:#fffdf8;--ink:#1f1d1a;--muted:#5f5a52;--rule:#d9d3c6;--accent:#9a3412;--mark:#fbe9d7;--code:#efeae0}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#15171a;--paper:#1c1f23;--ink:#e6e2da;--muted:#a39d92;--rule:#33383f;--accent:#f0a36b;--mark:#3a2a1e;--code:#24282d}}
:root[data-theme="dark"]{--bg:#15171a;--paper:#1c1f23;--ink:#e6e2da;--muted:#a39d92;--rule:#33383f;--accent:#f0a36b;--mark:#3a2a1e;--code:#24282d}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:1.35rem;margin:0 0 4px}
h2{font-size:1rem;margin:28px 0 8px;letter-spacing:.01em}
p,li{margin:0 0 6px}
.meta,.small{color:var(--muted);font-size:.875rem}
.limits{border-left:3px solid var(--accent);background:var(--paper);padding:12px 16px;margin:16px 0}
.limits ul{margin:6px 0 0;padding-left:18px}
table{border-collapse:collapse;width:100%;font-size:.875rem;background:var(--paper)}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--rule);vertical-align:top}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.scroll{overflow-x:auto}
.row{display:grid;grid-template-columns:1fr;gap:4px 28px;padding:10px 0;border-bottom:1px solid var(--rule)}
@media (min-width:900px){.row{grid-template-columns:minmax(0,68ch) minmax(0,1fr)}}
.src{background:var(--paper);padding:10px 14px;margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:1.0625rem/1.6 Georgia,"Iowan Old Style","Times New Roman",serif}
.ln{color:var(--muted);font:.75rem/1 ui-monospace,Consolas,monospace;user-select:none;margin-right:8px}
mark{background:var(--mark);color:inherit;text-decoration-line:underline;text-decoration-color:var(--accent);text-underline-offset:3px;padding:0 1px}
mark.weak{text-decoration-style:dotted}
mark.moderate{text-decoration-style:solid}
mark.strong{text-decoration-style:double;font-weight:600}
sup{color:var(--accent);font:600 .7rem/1 system-ui,sans-serif;margin-left:1px}
.notes{list-style:none;margin:0;padding:0;font-size:.875rem}
.notes li{margin:0 0 8px;padding-left:2.2em;text-indent:-2.2em}
.notes b{color:var(--accent);font-variant-numeric:tabular-nums}
.w{color:var(--muted)}
code{background:var(--code);padding:1px 4px;font:.85em ui-monospace,Consolas,monospace;overflow-wrap:anywhere}
a{color:var(--accent)}
a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
`.trim();

/** Merge overlapping findings into spans that carry every note number. */
function spansOf(numbered) {
  const spans = [];
  for (const f of numbered) {
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

const RANK = { weak: 0, moderate: 1, strong: 2 };

/**
 * @param {object} report        a tells/report@1
 * @param {string} documentText  the document the report describes
 * @param {object} [opts]
 * @param {string} [opts.title]    page title
 * @param {string} [opts.caption]  one line shown under the title (provenance of the text)
 */
export function render(report, documentText, { title, caption } = {}) {
  const doc = parseDocument(documentText, { plain: !!report.options?.plain });

  const all = [];
  for (const r of report.rules) {
    for (const f of r.findings) all.push({ ...f, rule: r.id, ruleName: r.name, w: effectiveWeight(r, f) });
  }
  all.sort((a, b) => a.offset - b.offset || a.length - b.length);
  all.forEach((f, i) => { f.n = i + 1; });
  const inline = all.filter((f) => !f.aggregate);
  const spans = spansOf(inline);

  // Blocks: runs of non-blank lines of the raw text.
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

  const rows = blocks.map((b) => {
    let html = '';
    let at = b.start;
    for (const s of spans) {
      if (s.end <= b.start || s.start >= b.end) continue;
      const from = Math.max(s.start, b.start);
      const to = Math.min(s.end, b.end);
      html += esc(doc.raw.slice(at, from));
      const weight = s.items.reduce((w, f) => (RANK[f.w] > RANK[w] ? f.w : w), 'weak');
      const nums = s.items.filter((f) => f.offset >= b.start).map((f) => f.n).join(',');
      html += `<mark class="${weight}">${esc(doc.raw.slice(from, to))}</mark>${nums ? `<sup>${nums}</sup>` : ''}`;
      at = to;
    }
    html += esc(doc.raw.slice(at, b.end));
    const notes = all.filter((f) => f.offset >= b.start && f.offset < b.end);
    const list = notes
      .map((f) => `<li><b>${f.n}</b> <code>${esc(f.rule)}</code> <span class="w">${f.w}${f.aggregate ? ', aggregate' : ''}</span> ${f.line}:${f.col}${f.note ? ` ${esc(f.note)}` : ''}</li>`)
      .join('');
    return `<div class="row"><pre class="src"><span class="ln">${b.firstLine}</span>${html}</pre>${list ? `<ol class="notes">${list}</ol>` : '<div></div>'}</div>`;
  });

  const d = report.document;
  const name = title ?? d.path ?? 'document';
  const table = report.rules
    .map((r) => `<tr><td><code>${esc(r.id)}</code></td><td>${r.weight}</td><td class="n">${r.count}</td><td class="n">${r.per1k.toFixed(2)}</td><td>${esc(baselineText(r))}</td></tr>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta name="referrer" content="no-referrer">
<meta http-equiv="content-security-policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; object-src 'none'; form-action 'none'">
<title>tells: ${esc(name)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>${esc(name)}</h1>
${caption ? `<p class="small">${esc(caption)}</p>` : ''}
<p class="meta">${d.words} words, ${d.sentences} sentences, ${d.paragraphs} paragraphs, ${d.lines} lines. sha256 <code>${esc(d.sha256.slice(0, 16))}</code>. Observed ${esc(report.observedAt.slice(0, 10))} with tells ${esc(report.tool.version)}. Options <code>${esc(optionsText(report))}</code>.</p>
${partialRunText(report) ? `<p class="limits"><strong>${esc(partialRunText(report))}.</strong> Rules that did not run cannot report anything, so an absence below is not a result.</p>` : ''}
<div class="limits"><strong>What this page is not.</strong> Counts and locations of surface features. Not a verdict.
<ul>${report.limits.map((l) => `<li>${esc(l)}</li>`).join('')}<li>Source: <a href="${esc(report.limitsSource.url)}">${esc(report.limitsSource.label)}</a></li></ul></div>
<h2>Per rule</h2>
<div class="scroll"><table><thead><tr><th>rule</th><th>weight</th><th class="n">count</th><th class="n">per 1k</th><th>baseline</th></tr></thead><tbody>${table}</tbody></table></div>
<p class="small">${esc(totalsText(report.totals))}${report.rates.reliable ? '' : ` ${esc(report.rates.note)}.`} Underline style shows weight: dotted weak, solid moderate, double strong.</p>
<h2>Text</h2>
${rows.join('\n')}
<h2>Statistics</h2>
<p class="small">${esc(report.stats.label)}.</p>
<p class="small">Sentence length mean ${report.stats.sentenceLength.mean ?? 'n/a'}, sd ${report.stats.sentenceLength.sd ?? 'n/a'} words (n=${report.stats.sentenceLength.n}). Paragraph length mean ${report.stats.paragraphLength.mean ?? 'n/a'} sentences. Type-token ratio ${report.stats.typeTokenRatio.value ?? 'n/a'} (${esc(report.stats.typeTokenRatio.note)}).</p>
<h2>Reproduce</h2>
<p><code>${esc(report.command)}</code></p>
<p class="small">Rule catalogue draws on Wikipedia's Signs of AI writing (CC BY-SA 4.0).</p>
</main>
</body>
</html>
`;
}
