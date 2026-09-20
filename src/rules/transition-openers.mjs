/**
 * transition-openers: sentences that begin "Additionally," or "Moreover,".
 *
 * Only the first words of a sentence are tested, so "the results were,
 * overall, positive" is not matched. Reports density per 1,000 words and the
 * share of sentences that open this way, since the pattern is about rhythm
 * across a document and not about any one sentence.
 *
 * FALSE POSITIVES. These are the connectives taught in school essay
 * writing and in most English-as-a-second-language courses, which is
 * precisely the population Liang et al. found detectors misclassifying. A
 * writer who was taught to signpost every paragraph will score high here and
 * is not a machine. Legal and academic prose also signposts by convention.
 */
import { TRANSITION_OPENERS, SOURCES } from './lexicon.mjs';
import { phraseSource, sentenceOpening } from './util.mjs';
import { per1k } from '../document.mjs';

const RE = new RegExp(`^(?:${TRANSITION_OPENERS.map(phraseSource).join('|')})(?![\\p{L}\\p{N}_-])`, 'u');

function detect(doc) {
  const found = [];
  for (const s of doc.proseSentences) {
    const at = sentenceOpening(doc, s);
    const m = RE.exec(doc.text.slice(at, s.end));
    if (m) found.push(doc.finding(at, m[0].length));
  }
  return found;
}

function detail(doc, findings) {
  return {
    sentences: doc.counts.sentences,
    shareOfSentences: doc.counts.sentences ? Math.round((findings.length / doc.counts.sentences) * 1000) / 1000 : null,
    per1k: per1k(findings.length, doc.counts.words),
  };
}

export default {
  id: 'transition-openers',
  name: 'Transition openers',
  category: 'structure',
  weight: 'weak',
  description:
    'Counts sentences that open with a stock connective: Additionally, Moreover, Furthermore, In addition, Overall, Ultimately, In conclusion, Notably, Importantly, Interestingly, Crucially, In summary, That said, In today\'s. Reports the share of sentences that open this way. False positive: these are the connectives taught in school essays and in most English-as-a-second-language courses, the same writers detectors were found to misclassify. A writer taught to signpost every paragraph will be counted here.',
  source: [SOURCES.wikipedia, SOURCES.liang],
  baseline: null,
  historical: false,
  detect,
  detail,
};
