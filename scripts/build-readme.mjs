/**
 * build-readme.mjs: fill the generated blocks of README.md.
 *
 *   node scripts/build-readme.mjs           rewrite the blocks
 *   node scripts/build-readme.mjs --check   exit 1 if README.md is stale
 *
 * The copy rules say no hand-typed figures. Every number in the README's
 * rules and corpus sections sits between <!-- name:start --> and
 * <!-- name:end --> markers and is written here from src/rules and
 * corpus/results.json, including the sentences that say what the table shows.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RULES } from '../src/rules/index.mjs';
import { corpusTable, corpusLegend, evasionSummary } from '../src/corpus.mjs';
import { EM_DASH_BASELINE } from '../src/rules/lexicon.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const README = join(ROOT, 'README.md');

function rulesBlock() {
  const rows = RULES.map((r) => `| \`${r.id}\` | ${r.category} | ${r.weight}${r.historical ? ' (historical, off by default)' : ''} | ${r.baseline ? `${r.baseline.per1k} per 1k, ${r.baseline.label}` : 'none published'} |`);
  return ['| rule | category | weight | baseline |', '|---|---|---|---|', ...rows].join('\n');
}

/**
 * What the corpus table shows, as numbers. One owner: the README sentences
 * below and the showcase page (through docs/data.js) both read this, so the
 * two cannot disagree.
 */
export function corpusFacts(r) {
  const by = (kind) => r.files.filter((f) => f.kind === kind);
  const span = (files, id) => {
    const v = files.map((f) => f.rates[id].per1k);
    return { min: Math.min(...v), max: Math.max(...v) };
  };
  const dash = [...r.files].sort((a, b) => b.rates['em-dash'].per1k - a.rates['em-dash'].per1k)[0];
  const gpt = EM_DASH_BASELINE.machine[0];
  const plainMachine = by('machine').filter((f) => f.id !== r.evasion.evasion);
  const ev = r.files.find((f) => f.id === r.evasion.evasion);
  return {
    files: r.files.length,
    rules: r.ruleIds.length,
    plainMachineFiles: plainMachine.length,
    dashTop: { id: dash.id, kind: dash.kind, per1k: dash.rates['em-dash'].per1k },
    dashPublishedMachine: { label: gpt.label, per1k: gpt.per1k },
    dashMachine: span(plainMachine, 'em-dash'),
    vocabularyHuman: span(by('human'), 'vocabulary'),
    vocabularyMachine: span(plainMachine, 'vocabulary'),
    overlap: r.ruleIds.filter((id) => {
      const h = span(by('human'), id);
      return h.max >= span(plainMachine, id).min && h.max > 0;
    }),
    // Minor 4: the same count with the evasion sample back in the machine
    // group, so a reader can see how much the figure depends on excluding it.
    overlapWithEvasion: r.ruleIds.filter((id) => {
      const h = span(by('human'), id);
      return h.max >= span(by('machine'), id).min && h.max > 0;
    }),
    // Every rule's top human rate against the lowest rate in the machine
    // files that were not written to avoid the rules. A rule separates the
    // two groups in-sample only when the machine floor is above the human
    // ceiling and is not itself zero.
    separation: r.ruleIds.map((id) => {
      const humanMax = span(by('human'), id).max;
      const machineMin = span(plainMachine, id).min;
      return { id, humanMax, machineMin, separates: machineMin > humanMax && machineMin > 0 };
    }),
    silent: r.ruleIds.filter((id) => r.files.every((f) => f.rates[id].count === 0)),
    evasionId: ev.id,
    evasion: { id: ev.id, words: ev.words, findings: Object.values(ev.rates).reduce((n, x) => n + x.count, 0) },
    hybrids: r.files.filter((f) => f.localisation).map((f) => ({ id: f.id, ...f.localisation })),
  };
}

function corpusBlock() {
  const r = JSON.parse(readFileSync(join(ROOT, 'corpus', 'results.json'), 'utf8'));
  const k = corpusFacts(r);
  const text = (x) => x.min.toFixed(1) + ' to ' + x.max.toFixed(1);
  const dash = k.dashTop;
  const gpt = k.dashPublishedMachine;
  const ev = k.evasion;
  const { overlap, silent } = k;
  const separates = k.separation.filter((s) => s.separates);
  const hybrids = k.hybrids.map((l) => {
    const f = l;
    return `\`${f.id}\`: the inserted paragraph is ${(l.shareOfWords * 100).toFixed(1)}% of the words and holds ${l.findingsInside} of ${l.findingsTotal} findings`;
  });

  return [
    `Observed ${r.observedAt} with tells ${r.tool.version}. Reproduce: \`${r.command.replace(/^tells/, 'node bin/tells.mjs')}\``,
    '',
    corpusTable(r),
    '',
    corpusLegend(r),
    '',
    r.caveat,
    '',
    'What this table shows, computed from `corpus/results.json` by `scripts/build-readme.mjs`:',
    '',
    `- The highest em-dash rate in the corpus belongs to a human: ${dash.per1k.toFixed(1)} per 1k in \`${dash.id}\` (${dash.kind}). The published figure for ${gpt.label} is ${gpt.per1k}. Machine files here range from ${text(k.dashMachine)}. Dash density does not identify an author.`,
    `- \`vocabulary\` is ${text(k.vocabularyHuman)} per 1k in the human files and ${text(k.vocabularyMachine)} in the five machine files written without an avoidance instruction.`,
    `- For ${overlap.length} of ${r.ruleIds.length} rules the highest human rate reaches or passes the lowest machine rate: ${overlap.map((id) => `\`${id}\``).join(', ')}. For those rules a rate alone separates nothing, even in-sample. The five machine files written without an avoidance instruction are used for that floor; counting \`${k.evasionId}\` as well makes it ${k.overlapWithEvasion.length} of ${r.ruleIds.length}.`,
    `- Counted the other way round: ${separates.length} of ${r.ruleIds.length} rules separate the two groups here, meaning their lowest machine rate is above their highest human rate and is not zero${separates.length ? `: ${separates.map((s) => `\`${s.id}\``).join(', ')}` : ''}. The remaining ${r.ruleIds.length - separates.length} do not.`,
    '',
    'Top human rate against the lowest rate in the five machine files written without an avoidance instruction, per 1,000 words:',
    '',
    '| rule | top human | lowest machine | separates here |',
    '|---|---:|---:|---|',
    ...k.separation.map((s) => `| \`${s.id}\` | ${s.humanMax.toFixed(1)} | ${s.machineMin.toFixed(1)} | ${s.separates ? 'yes' : 'no'} |`),
    '',
    `- ${silent.length} rules found nothing in any file: ${silent.map((id) => `\`${id}\``).join(', ')}. This corpus says nothing about them.`,
    `- The evasion sample is machine text and has ${ev.findings} findings in ${ev.words} words. ${evasionSummary(r)}`,
    `- Localisation in the hybrids: ${hybrids.join('; ')}.`,
  ].join('\n');
}

export function build(text) {
  const blocks = { rules: rulesBlock(), corpus: corpusBlock() };
  let out = text;
  for (const [name, body] of Object.entries(blocks)) {
    const re = new RegExp(`(<!-- ${name}:start -->)[\\s\\S]*?(<!-- ${name}:end -->)`);
    if (!re.test(out)) throw new Error(`README.md has no ${name} block`);
    out = out.replace(re, (_, a, b) => `${a}\n${body}\n${b}`);
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const current = readFileSync(README, 'utf8');
  const next = build(current);
  if (process.argv.includes('--check')) {
    console.log(next === current ? 'README.md generated blocks are current' : 'README.md is stale. Run: node scripts/build-readme.mjs');
    process.exit(next === current ? 0 : 1);
  }
  writeFileSync(README, next);
  console.log('README.md blocks rewritten');
}
