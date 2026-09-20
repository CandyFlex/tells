/**
 * vocabulary: words that rose sharply in model output, counted and clustered.
 *
 * The guide this rule draws on is explicit that one or two of these words
 * mean nothing and that clustering is the signal. So the rule reports two
 * different things and keeps them apart:
 *
 *   - every hit, which feeds the per-1,000-word density
 *   - clusters: a run of at least 3 DISTINCT list words inside 150 running
 *     words. A cluster finding is marked `aggregate: true`; it spans the run,
 *     it is not added to the rule's count, and it is the part worth reading.
 *
 * FALSE POSITIVES. Every word here is ordinary English. A landscape architect
 * writes "landscape", a statistician writes "robust", a lawyer writes
 * "testament", and a programmer writes "underscore". Academic prose used
 * "crucial" and "notably" long before 2022. A single hit is not a finding
 * about the writer; treat the density and the clusters as the measurement.
 */

import { VOCABULARY, CLUSTER_WINDOW_WORDS, CLUSTER_MIN_DISTINCT, SOURCES } from './lexicon.mjs';
import { phraseSource, inOrder } from './util.mjs';

const ENTRIES = VOCABULARY.map((v) => ({
  ...v,
  re: new RegExp(`(?<![\\p{L}\\p{N}_-])(?:${phraseSource(v.pattern)})(?![\\p{L}\\p{N}_-])`, 'giu'),
}));

function wordIndexAt(doc, offset) {
  let lo = 0;
  let hi = doc.words.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (doc.words[mid].end <= offset) lo = mid + 1; else hi = mid;
  }
  return lo;
}

function detect(doc) {
  const hits = [];
  for (const entry of ENTRIES) {
    for (const f of doc.findAll(entry.re, { note: entry.word })) hits.push(f);
  }
  const ordered = inOrder(hits);

  // Clusters: greedy, non-overlapping windows of CLUSTER_WINDOW_WORDS words.
  const clusters = [];
  const at = ordered.map((h) => wordIndexAt(doc, h.offset));
  let i = 0;
  while (i < ordered.length) {
    let j = i;
    const distinct = new Set();
    while (j < ordered.length && at[j] - at[i] < CLUSTER_WINDOW_WORDS) {
      distinct.add(ordered[j].note);
      j++;
    }
    if (distinct.size >= CLUSTER_MIN_DISTINCT) {
      const first = ordered[i];
      const last = ordered[j - 1];
      const span = at[j - 1] - at[i] + 1;
      clusters.push(
        doc.finding(
          first.offset,
          last.offset + last.length - first.offset,
          `cluster: ${distinct.size} distinct list words within ${span} words (${[...distinct].join(', ')})`,
          { aggregate: true },
        ),
      );
      i = j;
    } else {
      i++;
    }
  }
  return inOrder([...ordered, ...clusters]);
}

function detail(doc, findings) {
  const words = {};
  for (const f of findings) if (!f.aggregate) words[f.note] = (words[f.note] || 0) + 1;
  return {
    words,
    distinct: Object.keys(words).length,
    clusters: findings.filter((f) => f.aggregate).length,
    clusterDefinition: `${CLUSTER_MIN_DISTINCT} or more distinct list words within ${CLUSTER_WINDOW_WORDS} running words`,
  };
}

export default {
  id: 'vocabulary',
  name: 'Overrepresented vocabulary',
  category: 'vocabulary',
  weight: 'moderate',
  description:
    'Counts words that studies and Wikipedia editors found overused in model output, sorted by the model generation that overused them, and marks clusters of 3 or more distinct list words inside 150 running words. The source guide says clustering is the signal and single hits are not. False positive: every listed word is ordinary English. A landscape architect writes "landscape", a statistician writes "robust", a lawyer writes "testament", and academic prose used "crucial" long before 2022.',
  source: [SOURCES.wikipedia, SOURCES.kobak],
  baseline: null,
  historical: false,
  detect,
  detail,
};
