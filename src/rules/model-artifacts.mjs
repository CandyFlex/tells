/**
 * model-artifacts: markup that chat products leak into copied text.
 *
 * `contentReference[oaicite:0]`, `[cite: 3]`, `grok_card`, lenticular
 * citation brackets around digits, `turn0search1`. None of these is prose
 * and no style guide produces them; they are serialisation debris from a
 * specific product, and the finding names the product. With chat-residue,
 * this is the one class where a single hit is real evidence that text passed
 * through a chat interface. It still says nothing about who wrote the
 * sentences around it, or how much of them.
 *
 * `utm_source=` is kept here because the guide lists it, but it is weighted
 * weak on the finding itself: newsletters and ad platforms add it to links
 * that people paste every day.
 *
 * This rule reads the structure view: URLs and HTML are visible (that is
 * where the debris lives) but code fences and inline code are blanked, so a
 * document that discusses these markers in code formatting is not flagged
 * for quoting them.
 *
 * FALSE POSITIVES. An article ABOUT these artifacts that names them in
 * running prose instead of code formatting. `attached_file` as an ordinary
 * identifier in a technical note. Lenticular brackets around numbers in
 * Chinese and Japanese typography, where they are normal punctuation.
 */
import { MODEL_ARTIFACTS, SOURCES } from './lexicon.mjs';
import { withoutOverlaps } from './util.mjs';

const ENTRIES = MODEL_ARTIFACTS.map((a) => ({ ...a, re: new RegExp(a.pattern, 'gu') }));

function detect(doc) {
  const found = [];
  for (const a of ENTRIES) {
    found.push(
      ...doc.findAll(a.re, {
        view: 'structure',
        note: a.weight ? `${a.product}; weak on its own` : a.product,
        extra: a.weight ? { weight: a.weight } : undefined,
      }),
    );
  }
  return withoutOverlaps(found);
}

export default {
  id: 'model-artifacts',
  name: 'Model artifacts',
  category: 'artifact',
  weight: 'strong',
  description:
    'Finds serialisation debris that chat products leak into copied text: oaicite, contentReference, oai_citation, turn0search, attributableIndex, [cite: N], [span_N](start_span), grok_card, grok_render_citation_card_json, lenticular citation brackets around digits, ppl-ai-file-upload, attached_file, :::writing, and utm_source= in links (that last one is weighted weak, because newsletters add it to links people paste every day). Code fences and inline code are skipped. False positive: an article about these markers that names them in running prose, attached_file as an ordinary identifier, and lenticular brackets in Chinese or Japanese typography. A hit shows text passed through a chat interface; it does not show who wrote the sentences around it.',
  source: [SOURCES.wikipedia],
  baseline: null,
  historical: false,
  detect,
};
