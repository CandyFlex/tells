/**
 * inline-header-lists: bullets that each start with a bolded label and a colon.
 *
 *   - **Speed:** pages load in under a second.
 *   - **Reach:** customers find you on any device.
 *   - **Trust:** a real site signals a real business.
 *
 * The guide calls these inline-header vertical lists. A run must be at least
 * 3 consecutive items (blank lines between items are allowed) before any of
 * it is reported, and then every item in the run is a finding noted "item i
 * of n", so the report points at each one. The bare form `- Label: text` is
 * counted too, when the label is 1 to 4 capitalised words.
 *
 * This is a formatting rule: it reads the structure view, where code is
 * blanked and everything else is as written.
 *
 * FALSE POSITIVES. Glossaries, changelogs ("- Fixed: ..."), API parameter
 * lists and meeting minutes are inline-header lists written by people, and
 * they are the right format for that content. The rule knows the shape, not
 * whether the shape fits the material.
 */
import { SOURCES } from './lexicon.mjs';

const MIN_RUN = 3;
const BOLD_ITEM = /^(\s*(?:[-*+]|\d{1,9}[.)])\s+)((\*\*|__)[^*_\n]{1,60}?:?\3:?)(?=\s+\S)/u;
const PLAIN_ITEM = /^(\s*(?:[-*+]|\d{1,9}[.)])\s+)(\p{Lu}[\p{L}\p{N}'-]*(?:\s+[\p{L}\p{N}'&-]+){0,3}:)(?=\s+\S)/u;

function headerOf(line) {
  const b = BOLD_ITEM.exec(line);
  if (b && /:/.test(b[2])) return { lead: b[1].length, header: b[2], form: 'bold' };
  const p = PLAIN_ITEM.exec(line);
  if (p) return { lead: p[1].length, header: p[2], form: 'plain' };
  return null;
}

function detect(doc) {
  const found = [];
  let run = [];
  const flush = () => {
    if (run.length >= MIN_RUN) {
      run.forEach((r, i) => found.push(doc.finding(r.offset, r.header.length, `${r.form} header, item ${i + 1} of ${run.length}`)));
    }
    run = [];
  };
  for (let n = 1; n <= doc.lines.length; n++) {
    const kind = doc.kinds[n - 1];
    if (kind === 'blank') continue;
    if (kind === 'list') {
      const h = headerOf(doc.lineText(n, 'structure'));
      if (h) run.push({ ...h, offset: doc.lines[n - 1].start + h.lead });
      else flush();
    } else if (kind === 'prose' && /^\s+\S/.test(doc.lineText(n, 'structure')) && run.length) {
      continue; // an indented continuation line of the current item
    } else {
      flush();
    }
  }
  flush();
  return found;
}

export default {
  id: 'inline-header-lists',
  name: 'Inline-header lists',
  category: 'formatting',
  weight: 'moderate',
  description:
    'Counts runs of 3 or more consecutive list items that each open with a label and a colon, bolded ("- **Speed:** text") or bare ("- Speed: text"). Every item in a qualifying run is reported. False positive: glossaries, changelogs, API parameter lists and meeting minutes are inline-header lists written by people, and it is the right format for that content.',
  source: [SOURCES.wikipedia],
  baseline: null,
  historical: false,
  detect,
};
