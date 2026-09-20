/**
 * Tests for the rules. Every rule gets at least one passage it must find and
 * at least one passage a naive regular expression WOULD flag and this rule
 * must not. The negatives are the point: a linter for prose is judged by
 * what it leaves alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RULES, RULE_IDS, CATEGORIES, WEIGHTS, getRule, selectRules } from '../src/rules/index.mjs';
import { VOCABULARY, SOURCES } from '../src/rules/lexicon.mjs';
import { analyze } from '../src/report.mjs';
import { parseDocument } from '../src/document.mjs';

const DASH = '\u{2014}';
const EN = '\u{2013}';
const FILLER = 'The committee met on Tuesday and approved the budget without discussion. '.repeat(3);

const run = (id, text, opts = {}) => analyze(text, { only: [id], observedAt: '2026-09-19T00:00:00.000Z', ...opts }).rules[0];
const notes = (r) => r.findings.map((f) => f.note);
const matches = (r) => r.findings.map((f) => f.match);

/* ---------------- the contract ---------------- */

test('the registry holds the eighteen rules the spec names, in order', () => {
  assert.deepEqual(RULE_IDS, [
    'vocabulary', 'copula-avoidance', 'negative-parallelism', 'rule-of-three', 'em-dash', 'ing-analysis',
    'significance-inflation', 'puffery', 'vague-attribution', 'vague-association', 'transition-openers',
    'challenges-formula', 'inline-header-lists', 'bold-overuse', 'heading-style', 'chat-residue',
    'model-artifacts', 'didactic-disclaimers',
  ]);
});

test('every rule meets the module contract and says what a false positive looks like', () => {
  for (const r of RULES) {
    assert.match(r.id, /^[a-z]+(?:-[a-z]+)*$/, r.id);
    assert.ok(r.name && typeof r.name === 'string', `${r.id}: name`);
    assert.ok(CATEGORIES.includes(r.category), `${r.id}: category ${r.category}`);
    assert.ok(WEIGHTS.includes(r.weight), `${r.id}: weight ${r.weight}`);
    assert.match(r.description, /False positive:/, `${r.id}: description must state a false positive`);
    assert.ok(Array.isArray(r.source) && r.source.length > 0, `${r.id}: source`);
    for (const s of r.source) {
      assert.ok(s.label && /^https:\/\//.test(s.url), `${r.id}: source needs a label and an https url`);
    }
    assert.equal(typeof r.historical, 'boolean', `${r.id}: historical`);
    assert.equal(typeof r.detect, 'function', `${r.id}: detect`);
    assert.ok(r.baseline === null || Number.isFinite(r.baseline.per1k), `${r.id}: baseline`);
  }
});

test('only the artifact rules are strong, and every rule credits the Wikipedia guide', () => {
  assert.deepEqual(RULES.filter((r) => r.weight === 'strong').map((r) => r.id), ['chat-residue', 'model-artifacts']);
  assert.deepEqual(RULES.filter((r) => r.category === 'artifact').map((r) => r.id), ['chat-residue', 'model-artifacts']);
  for (const r of RULES) assert.ok(r.source.includes(SOURCES.wikipedia), `${r.id} must cite the guide`);
});

test('the em-dash rule carries the three published baselines with their sources', () => {
  const b = getRule('em-dash').baseline;
  assert.equal(b.per1k, 3.23);
  assert.deepEqual(b.alt.map((a) => a.per1k), [4.8, 6.5]);
  assert.deepEqual(b.machine.map((m) => m.per1k), [10.62]);
  assert.ok(getRule('em-dash').source.some((s) => /2603\.27006/.test(s.url)));
});

test('historical rules are off by default, on with the flag, and on when named', () => {
  assert.ok(!selectRules().some((r) => r.historical));
  assert.ok(selectRules({ historical: true }).some((r) => r.id === 'didactic-disclaimers'));
  assert.deepEqual(selectRules({ only: ['didactic-disclaimers'] }).map((r) => r.id), ['didactic-disclaimers']);
  assert.ok(!selectRules({ ignore: ['em-dash'] }).some((r) => r.id === 'em-dash'));
  assert.throws(() => selectRules({ only: ['nope'] }), /unknown rule "nope"/);
});

test('lexicon patterns all compile and no word is listed twice', () => {
  const seen = new Set();
  for (const v of VOCABULARY) {
    assert.ok(!seen.has(v.word), `duplicate ${v.word}`);
    seen.add(v.word);
    assert.doesNotThrow(() => new RegExp(v.pattern, 'iu'));
    assert.ok(Array.isArray(v.eras) && typeof v.kobak === 'boolean');
  }
});

/* ---------------- location integrity, for every rule at once ---------------- */

const KITCHEN_SINK = [
  '# Challenges And Future Outlook For Rural Towns',
  '',
  `Certainly! Here's an overview. The town is not just a place ${DASH} it's a vibrant community, nestled in the heart of`,
  'the valley. It serves as a testament to the enduring spirit of its people, highlighting the pivotal role of',
  'tradition. Experts say the landscape is crucial. Additionally, it boasts a rich history, a diverse array of',
  'shops, and a commitment to quality, service, and value. The festival is associated with various cultural traditions.',
  '',
  '- **Speed:** fast, reliable, and affordable service.',
  '- **Reach:** customers find you anywhere.',
  '- **Trust:** a real site signals a real business.',
  '',
  'Despite its successes, the town faces several challenges. :contentReference[oaicite:0]{index=0}',
  '',
  "It's important to note that results vary. In conclusion, the future is bright. I hope this helps!",
].join('\n');

test('every finding from every rule is located exactly where it says it is', () => {
  const report = analyze(KITCHEN_SINK, { historical: true });
  const doc = parseDocument(KITCHEN_SINK);
  const fired = report.rules.filter((r) => r.findings.length > 0).map((r) => r.id);
  for (const id of RULE_IDS) assert.ok(fired.includes(id), `${id} should fire on the kitchen-sink fixture`);
  let checked = 0;
  for (const r of report.rules) {
    for (const f of r.findings) {
      const offset = doc.offsetOf(f.line, f.col);
      assert.equal(offset, f.offset, `${r.id}: offset disagrees with line:col`);
      assert.equal(doc.raw.slice(offset, offset + f.length), f.match, `${r.id} at ${f.line}:${f.col}`);
      assert.ok(f.length > 0 && f.match.length === f.length);
      assert.ok(typeof f.excerpt === 'string' && f.excerpt.length > 0 && f.excerpt.length <= 166, `${r.id}: excerpt`);
      checked++;
    }
  }
  assert.ok(checked > 30, `expected many findings, got ${checked}`);
});

test('findings come back in document order', () => {
  for (const r of analyze(KITCHEN_SINK, { historical: true }).rules) {
    for (let i = 1; i < r.findings.length; i++) assert.ok(r.findings[i].offset >= r.findings[i - 1].offset, r.id);
  }
});

test('masking is real: code, URLs and front matter never produce vocabulary findings', () => {
  const src = [
    '---', 'title: delve into the vibrant tapestry', 'tags: [pivotal, crucial]', '---', '',
    'Plain text about the meeting.', '', '```', 'delve(); // a pivotal, crucial, vibrant tapestry', '```', '',
    'Use `delve` here, or see https://example.com/delve-into-the-pivotal-tapestry and',
    '[the docs](https://example.com/crucial/vibrant "A testament").', '',
    '    showcase = underscore + landscape',
  ].join('\n');
  const report = analyze(src);
  for (const id of ['vocabulary', 'significance-inflation', 'puffery', 'em-dash']) {
    assert.equal(report.rules.find((r) => r.id === id).findings.length, 0, `${id} must find nothing`);
  }
  assert.ok(run('vocabulary', src, { plain: true }).count > 5, 'and --plain really does turn masking off');
});

/* ---------------- vocabulary ---------------- */

test('vocabulary: counts inflections, reports per-word counts, and finds clusters', () => {
  const r = run('vocabulary', `We delved into it. The team delves daily. ${FILLER} It underscores a pivotal, vibrant shift.`);
  assert.equal(r.detail.words.delve, 2);
  assert.equal(r.detail.distinct, 4);
  assert.equal(r.count, 5);
  assert.equal(r.detail.clusters, 1);
  const cluster = r.findings.find((f) => f.aggregate);
  assert.match(cluster.note, /cluster: 4 distinct list words/);
  assert.equal(r.findings.length, 6, 'five words and one cluster');
});

test('vocabulary: two list words far apart are hits but not a cluster', () => {
  const r = run('vocabulary', `A pivotal day. ${FILLER.repeat(6)} A vibrant evening.`);
  assert.equal(r.count, 2);
  assert.equal(r.detail.clusters, 0);
});

test('vocabulary: repeating one word is not a cluster, because clusters need distinct words', () => {
  const r = run('vocabulary', 'Crucial. It is crucial. So crucial. Crucially so.');
  assert.equal(r.count, 4);
  assert.equal(r.detail.clusters, 0);
});

test('vocabulary: the noun "key" and words that merely contain a list word are left alone', () => {
  const r = run('vocabulary', 'The key is under the mat, and the key to the shed is lost. We ate key lime pie. The boastful keynote was a testamentary matter in the realms-adjacent hall.');
  assert.deepEqual(matches(r), []);
  assert.deepEqual(matches(run('vocabulary', 'Three key factors decide it.')), ['key']);
});

/* ---------------- copula-avoidance ---------------- */

test('copula-avoidance: finds the substitutes, across a line wrap too', () => {
  const r = run('copula-avoidance', 'The hall serves\nas a meeting place. It stands as a landmark and boasts a garden.');
  assert.deepEqual(matches(r), ['serves\nas', 'stands as', 'boasts']);
});

test('copula-avoidance: "preserves as", "refers tomorrow" and plain "is" are not matched', () => {
  assert.equal(run('copula-avoidance', 'She preserves as much fruit as she can. It is a hall. He offers advice.').count, 0);
});

/* ---------------- negative-parallelism ---------------- */

test('negative-parallelism: every sub-type is found and named', () => {
  const cases = {
    'not-only-but': 'It is not only fast but also cheap.',
    'not-just': "This is not just a bakery, it's a gathering place.",
    'not-x-its-y': "It's not a bug, it's a feature.",
    'no-x-no-y-just-z': 'No contracts, no hidden fees, just honest work.',
    'not-but-rather': 'The goal is not growth but rather stability.',
    'rather-than': 'Rather than wait for the grant, the town borrowed the money.',
  };
  for (const [note, text] of Object.entries(cases)) {
    const r = run('negative-parallelism', text);
    assert.deepEqual(notes(r), [note], text);
  }
  assert.deepEqual(notes(run('negative-parallelism', "It isn't just a shop.")), ['not-just']);
  const long = run('negative-parallelism', "Ridgeline isn't just a place to buy a bike \u{2014} it's a gathering place.");
  assert.equal(long.findings[0].match, "isn't just a place to buy a bike \u{2014} it's", 'the span starts at the whole negated word, not inside it');
  assert.deepEqual(notes(run('negative-parallelism', 'The gap is not merely a matter of convenience \u{2014} it is a question of equity.')), ['not-just']);
  assert.deepEqual(notes(run('negative-parallelism', 'A site doesn\u{2019}t just inform.')), ['not-just']);
});

test('negative-parallelism: M1, every match starts and ends on a whole word', () => {
  const cases = [
    ["The system isn't merely efficient; rather, it is transformative.", "isn't merely efficient; rather, it is"],
    ["Ridgeline isn't just a place to buy a bike, it's a place to talk about riding.", "isn't just a place to buy a bike, it's"],
    ["A shop doesn\u{2019}t just sell bikes, it is a meeting place.", "doesn\u{2019}t just sell bikes, it is"],
    ["It's not solely about speed, but about trust.", 'not solely about speed, but'],
  ];
  for (const [text, match] of cases) {
    const f = run('negative-parallelism', text).findings[0];
    assert.ok(f, text);
    assert.equal(f.match, match);
    const at = text.indexOf(match);
    assert.ok(at === 0 || /[^\p{L}\p{N}]/u.test(text[at - 1]), `starts mid-word: ${text}`);
  }
});

test('negative-parallelism: "solely" and "purely" are the same frame with one word changed', () => {
  assert.deepEqual(notes(run('negative-parallelism', "The tool isn't solely a linter.")), ['not-just']);
  assert.deepEqual(notes(run('negative-parallelism', 'The award is not purely honorary, but it carries a stipend.')), ['not-just']);
  assert.equal(run('negative-parallelism', 'She works solely on weekends. The dye is purely vegetable.').count, 0, 'the adverb alone is not a contrast frame');
});

test('negative-parallelism: a quotation with a citation, and ordinary negation, are left alone', () => {
  assert.equal(run('negative-parallelism', 'The court held that the duty "applies not only to employers but also to agents" (Smith v. Jones, 1984).').count, 0);
  assert.equal(run('negative-parallelism', '> It is not only fast but also cheap.\n\nThe reviewer disagreed.').count, 0);
  assert.equal(run('negative-parallelism', 'It is not a tool I would recommend. She was not just; she was cruel. I would rather than not.').count, 0);
});

/* ---------------- rule-of-three ---------------- */

test('rule-of-three: finds the three list forms and stacked adjectives', () => {
  assert.deepEqual(notes(run('rule-of-three', 'We value speed, clarity, and honesty.')), ['list of three, joined by "and"']);
  assert.deepEqual(notes(run('rule-of-three', 'We value speed, clarity and honesty.')), ['list of three, joined by "and"']);
  assert.deepEqual(notes(run('rule-of-three', 'Pick speed, clarity, or honesty.')), ['list of three, joined by "or"']);
  assert.deepEqual(notes(run('rule-of-three', 'It is a fast, reliable, scalable platform.')), ['three adjectives before a noun']);
  const r = run('rule-of-three', 'We value speed, clarity, and honesty. It rained.');
  assert.equal(r.detail.sentencesWithTriad, 1);
  assert.equal(r.detail.shareOfSentences, 0.5);
});

test('rule-of-three: a comma that ends a clause, followed by an ordinary "and", is not a list (cases from the corpus)', () => {
  const clauses = [
    'The measures were decided on the other side, as was wished and expected.',
    'It concerns the whole, who are united and actuated by some common impulse.',
    'They looked to the rights of other citizens, or to the permanent and aggregate interests of the community.',
    'His reason and his self-love, his opinions and his passions will have a reciprocal influence.',
    'In the area, there are magnificent homes and buildings.',
    'He is not divine, but the slave and prisoner of his own opinion.',
    'We sell new bikes from three brands, mostly mountain bikes and gravel bikes.',
    'In recent years, federal and state governments have made investments.',
    'I lived in Concord, Massachusetts, and earned my living by the labor of my hands.',
    'It was MENTIONED, without enlargement or discussion, in the appendix.',
  ];
  for (const text of clauses) assert.equal(run('rule-of-three', text).count, 0, text);
  assert.equal(run('rule-of-three', 'We see about 1,400 bikes a year, and the usual jobs are flat tires, brake pads and shifting.').count, 1, 'a thousands separator is not a list comma');
  assert.equal(run('rule-of-three', 'They share the same opinions, the same passions, and the same interests.').count, 1, 'a determiner triad is still a triad');
});

test('rule-of-three: M1, the span covers all three members or nothing is reported', () => {
  // Every string below was reported by the reviewer as a fragment that
  // misnamed the list. The first still fires, and now shows all of it.
  const r = run('rule-of-three', 'Add the onion, carrot, and celery and cook until soft.');
  assert.equal(r.findings[0].match, 'onion, carrot, and celery', 'three members, and the trailing "and cook until soft" is not one of them');
  assert.match(r.findings[0].excerpt, /^Add the onion, carrot, and celery and cook until soft\.$/);
  assert.equal(run('rule-of-three', 'They share the same opinions, the same passions, and the same interests.').findings[0].match,
    'the same opinions, the same passions, and the same interests', 'members longer than a word are shown whole');

  const notLists = [
    'Stop by the shop at 214 Alder Street, give us a call, or join us for a Saturday ride.',
    'He held the line in his own half of the chest, turned Reid, and finished low.',
    'Reduce by half, taste for salt, and spoon over the rice.',
  ];
  for (const text of notLists) assert.equal(run('rule-of-three', text).count, 0, text);

  // These two are real lists of three and still count. The complaint was the
  // fragment, not the finding: a eulogy and a liability clause are why the
  // rule is off by default now, and why its description says so.
  assert.equal(run('rule-of-three', 'He leaves behind four children, eleven grandchildren, and a great-grandson.').findings[0].match,
    'four children, eleven grandchildren, and a great-grandson');
  assert.equal(run('rule-of-three', 'The Company shall not be liable for any indirect, incidental, or consequential damages.').findings[0].match,
    'indirect, incidental, or consequential');
});

test('rule-of-three: a recipe, a list of four, named places and a bulleted list are inventories', () => {
  assert.equal(run('rule-of-three', 'Combine 2 cups flour, 1 tsp salt, and 3 eggs in a bowl.').count, 0);
  assert.equal(run('rule-of-three', 'We sell apples, pears, plums, and cherries.').count, 0);
  assert.equal(run('rule-of-three', 'They toured France, Spain, and Italy.').count, 0);
  assert.equal(run('rule-of-three', '- flour, sugar, and salt\n- butter').count, 0);
});

/* ---------------- em-dash ---------------- */

test('em-dash: counts the three dash forms, notes the comma slot, and compares to the baseline', () => {
  const r = run('em-dash', `The town${DASH}small as it is${DASH}survived. It was late -- too late. One thing ${EN} nothing else. ${DASH} Anon.`);
  assert.equal(r.count, 5);
  assert.deepEqual(notes(r), ['em dash; comma-slot', 'em dash; comma-slot', 'double hyphen; comma-slot', 'spaced en dash; comma-slot', 'em dash']);
  assert.equal(r.baseline.per1k, 3.23);
  assert.equal(r.aboveBaseline, null, 'a 24-word document is too short to compare with a published rate');
  // Long enough for the comparison to mean something, and then it is made.
  const filler = 'The committee met and approved the budget without objection. '.repeat(40);
  assert.equal(run('em-dash', `${filler}A town${DASH}small as it is${DASH}survived.`).aboveBaseline, true);
  assert.equal(run('em-dash', filler).aboveBaseline, false);
});

test('em-dash: a tight double hyphen between words is a typed dash, as in older transcriptions', () => {
  const r = run('em-dash', 'A favorite one is REISTE AB--which means departed. Run tool --flag now, or use i-- in a loop, or a--.');
  assert.deepEqual(notes(r), ['double hyphen; comma-slot']);
  assert.equal(r.findings[0].match, '--');
});

test('em-dash: ranges, hyphens, CLI flags and dashes inside code or URLs are not dashes', () => {
  const r = run('em-dash', `Open 1990${EN}1995, pages 3-4, a well-known fact. Run \`tool --flag ${DASH} x\` or see https://example.com/a${DASH}b.\n\n\`\`\`\nnpm test -- --watch ${DASH}\n\`\`\``);
  assert.equal(r.count, 0);
  assert.equal(r.aboveBaseline, null, 'too short to rate, so no comparison is printed either way');
});

/* ---------------- ing-analysis ---------------- */

test('ing-analysis: a trailing participle clause that closes the sentence', () => {
  const r = run('ing-analysis', 'Revenue doubled in 2019, underscoring the importance of the new approach. The mill closed, thereby contributing to the decline.');
  assert.deepEqual(notes(r), ['underscoring', 'contributing to']);
  assert.equal(r.findings[0].match, 'underscoring the importance of the new approach.');
});

test('ing-analysis: a participle with no comma, at the start, or mid-sentence is grammar', () => {
  assert.equal(run('ing-analysis', 'They kept ensuring compliance. Marking the exams took all night. The report, highlighting three failures, was shelved by the board.').count, 0);
});

/* ---------------- significance-inflation and puffery ---------------- */

test('significance-inflation: stock phrases, with "pivotal role" counted once', () => {
  const r = run('significance-inflation', 'It stands as a testament to the era and played a pivotal role. It left an indelible mark.');
  assert.deepEqual(matches(r), ['stands as a', 'testament to', 'pivotal role', 'indelible mark']);
});

test('significance-inflation: "the last will and testament" and "role" alone are left alone', () => {
  assert.equal(run('significance-inflation', 'He read the last will and testament. Her role was clerical. The mark was indelible ink.').count, 0);
});

test('puffery: brochure phrases', () => {
  const r = run('puffery', 'Nestled in the heart of the valley, the inn boasts a rich history and world-class dining.');
  assert.deepEqual(matches(r), ['Nestled', 'in the heart of', 'boasts', 'rich history', 'world-class']);
});

test('puffery: a rich sauce, a seamstress and the heart of the matter are left alone', () => {
  assert.equal(run('puffery', 'The sauce was rich. The seamstress got to the heart of the matter. He was committed to it.').count, 0);
});

/* ---------------- attribution ---------------- */

test('vague-attribution: unnamed authorities', () => {
  const r = run('vague-attribution', 'Experts say the market will recover. It is widely regarded as the finest example. Some say otherwise.');
  assert.deepEqual(matches(r), ['Experts say', 'It is widely regarded', 'Some say']);
});

test('vague-attribution: suppressed when the sentence or the next one carries something checkable', () => {
  const cited = [
    'Studies show a drop in no-shows (Hwang 2019).',
    'Studies show that deposits help. The drop was 23% across 40 restaurants.',
    'Research suggests deposits help [3].',
    'Experts say it works: https://example.com/study.',
    'Industry reports put the figure at $4 million.',
  ];
  for (const text of cited) assert.equal(run('vague-attribution', text).count, 0, text);
  assert.equal(run('vague-attribution', 'Studies show that deposits help. Owners like them. The drop was 23%.').count, 1, 'evidence two sentences away is too far');
});

test('vague-association: a connective with no named object', () => {
  assert.deepEqual(matches(run('vague-association', 'The festival is associated with various cultural traditions.')), ['associated with']);
});

test('vague-association: a named object within six words is a real claim', () => {
  assert.equal(run('vague-association', 'The fire was linked to the 1911 Triangle factory. He worked in association with Bell Labs. The pump is connected to "Tank B".').count, 0);
});

/* ---------------- structure ---------------- */

test('transition-openers: only at the start of a sentence, with the share reported', () => {
  const r = run('transition-openers', "Additionally, it rained. Moreover, it poured. In today's market, that matters. It stopped.");
  assert.deepEqual(matches(r), ['Additionally', 'Moreover', "In today's"]);
  assert.equal(r.detail.shareOfSentences, 0.75);
});

test('transition-openers: the same words mid-sentence are left alone', () => {
  assert.equal(run('transition-openers', 'The results were, overall, positive. It was ultimately his call, and notably so.').count, 0);
});

test('challenges-formula: the four shapes', () => {
  const src = ['## Challenges and Future Outlook', '', 'Despite its growth, the co-op faces significant challenges. Looking ahead, funding is uncertain.', '', 'In conclusion, the work goes on.'].join('\n');
  assert.deepEqual(notes(run('challenges-formula', src)), ['heading', 'despite-challenges', 'looking-ahead', 'closing-paragraph']);
});

test('challenges-formula: "despite" without the formula, and "Overall" outside the last paragraph', () => {
  assert.equal(run('challenges-formula', 'Despite the rain, we walked. Overall, a good day.\n\nWe went home.').count, 0);
  assert.equal(run('challenges-formula', '## The challenges of future outlooks\n\nText here.').count, 0);
});

/* ---------------- formatting ---------------- */

test('inline-header-lists: a run of three, bold or bare', () => {
  const bold = run('inline-header-lists', '- **Speed:** fast.\n- **Reach:** wide.\n\n- **Trust**: earned.');
  assert.deepEqual(matches(bold), ['**Speed:**', '**Reach:**', '**Trust**:']);
  assert.match(bold.findings[2].note, /item 3 of 3/);
  assert.equal(run('inline-header-lists', '1. Speed: fast.\n2. Reach: wide.\n3. Trust: earned.').count, 3);
});

test('inline-header-lists: two items, a list in a code fence, and a time of day are left alone', () => {
  assert.equal(run('inline-header-lists', '- **Speed:** fast.\n- **Reach:** wide.\n\nThat is all.').count, 0);
  assert.equal(run('inline-header-lists', '```\n- **A:** x\n- **B:** y\n- **C:** z\n```').count, 0);
  assert.equal(run('inline-header-lists', '- open at 9:30 daily\n- closed at 5:00 sharp\n- lunch at 12:00 noon').count, 0);
});

test('bold-overuse: every span is counted and a pile-up is an aggregate', () => {
  const r = run('bold-overuse', 'We offer **speed**, **reach** and **trust** daily.\n\nOne **more** here.');
  assert.equal(r.count, 4);
  assert.equal(r.detail.paragraphsWithThreeOrMore, 1);
  assert.equal(r.findings.filter((f) => f.aggregate).length, 1);
});

test('bold-overuse: asterisks in code, in maths and in italics are not bold', () => {
  assert.equal(run('bold-overuse', 'Compute `a ** b` or 2 ** 8 in *italic* text.\n\n```\n**not bold**\n```').count, 0);
});

test('heading-style: title case, empty section, skipped level, break before heading, emoji', () => {
  const src = ['# Guide', '', '## Getting Started With Local Search', '', '### Setup', '', 'Text.', '', '---', '', '##### Deep', '', '- \u{1F680} Launch fast'].join('\n');
  assert.deepEqual(notes(run('heading-style', src)), ['title-case', 'empty-section', 'thematic-break', 'skipped-level: h3 to h5', 'emoji-marker']);
});

test('heading-style: sentence case, a title over its first section, and a break between paragraphs', () => {
  assert.equal(run('heading-style', '# Guide\n\n## Getting started with local search\n\nText.\n\n---\n\nMore text.\n\n### Notes on the New York trial\n\nEnd.').count, 0);
});

/* ---------------- artifacts ---------------- */

test('chat-residue: the model talking to its user', () => {
  const r = run('chat-residue', "Here's a draft of your bio.\n\nCertainly! As an AI language model, I can't browse. I hope this helps. Let me know if you want changes.");
  assert.deepEqual(matches(r), ["Here's a", 'Certainly!', 'As an AI language model', 'I hope this helps', 'Let me know if']);
  assert.equal(r.weight, 'strong');
});

test('chat-residue: quoted speech, "Here is a" mid-document and "sure" mid-sentence are left alone', () => {
  assert.equal(run('chat-residue', 'The bot replied, "I hope this helps," and logged off. Here is a second point. I am sure! It was certainly! odd.\n\n> Let me know if you need more.').count, 0);
});

test('model-artifacts: product debris is found and the product is named', () => {
  const src = 'Sales rose :contentReference[oaicite:2]{index=2} and again [cite: 4, 5]. See \u{3010}12\u{2020}source\u{3011} and turn0search3. <grok_card id="1"> [span_0](start_span)';
  const r = run('model-artifacts', src);
  assert.deepEqual(matches(r), [':contentReference[oaicite:2]{index=2}', '[cite: 4, 5]', '\u{3010}12\u{2020}source\u{3011}', 'turn0search3', 'grok_card', '[span_0](start_span)']);
  assert.match(r.findings[0].note, /ChatGPT/);
  assert.match(r.findings[1].note, /Gemini/);
});

test('model-artifacts: utm_source inside a URL is found but weighted weak on the finding', () => {
  const report = analyze('Read [the post](https://example.com/p?utm_source=chatgpt.com) today.', { only: ['model-artifacts'] });
  const f = report.rules[0].findings[0];
  assert.equal(f.match, 'utm_source=chatgpt.com');
  assert.equal(f.weight, 'weak');
  assert.deepEqual(report.totals.byWeight, { weak: 1, moderate: 0, strong: 0 });
});

test('model-artifacts: the same markers inside code formatting are documentation, not debris', () => {
  assert.equal(run('model-artifacts', 'ChatGPT leaves `oaicite` and `[cite: 1]` behind.\n\n```\ncontentReference[oaicite:0]\ngrok_card\n```').count, 0);
});

test('didactic-disclaimers: found when asked for', () => {
  assert.deepEqual(matches(run('didactic-disclaimers', "It's important to note that results vary. Note that this is slow.")), ["It's important to note", 'Note that']);
  assert.equal(run('didactic-disclaimers', 'She left a note that said goodbye. He noted that it was late.').count, 0);
});

/* ---------------- whole documents ---------------- */

test('plain working prose produces nothing', () => {
  const plain = [
    'We fixed the intake form on Tuesday. It had been dropping about a third of submissions',
    'since the March deploy, which nobody noticed because the error was swallowed.',
    'Took two hours. The form now logs failures to the same place as everything else.',
  ].join('\n');
  assert.equal(analyze(plain).totals.findings, 0);
});

/* ---------------- one-word paraphrases (M8) ---------------- */

/**
 * The rules are closed phrase lists, so a synonym defeats them. That is
 * inherent, and the README says so now. These eleven are different: each is a
 * variant of a pattern the rule already claimed to cover, and each was missed
 * by one word. Every case is a positive and the negative that sits next to it,
 * so widening the list did not widen it into ordinary prose.
 */
test('M8: "Notwithstanding its many successes ... hurdles" is the despite-challenges shape', () => {
  assert.deepEqual(notes(run('challenges-formula', 'Notwithstanding its many successes, the field continues to confront a number of significant hurdles.')), ['despite-challenges']);
  assert.deepEqual(notes(run('challenges-formula', 'In spite of these gains, real obstacles remain.')), ['despite-challenges']);
  assert.equal(run('challenges-formula', 'Notwithstanding clause 4, the lease continues. The hurdles were cleared in June.').count, 0, 'the two halves have to be one sentence');
});

test('M8: "Challenges And The Road Ahead" and "The Road Ahead" are the heading', () => {
  assert.deepEqual(notes(run('challenges-formula', '# Challenges And The Road Ahead\n\nThe work continues.')), ['heading']);
  assert.deepEqual(notes(run('challenges-formula', '## The Road Ahead\n\nThe work continues.')), ['heading']);
  assert.equal(run('challenges-formula', 'The road ahead was closed for resurfacing.').count, 0, 'the same words in a sentence are a road');
});

test('M8: "Going forward," and "Looking forwards," open the same sentence as "Looking ahead,"', () => {
  assert.deepEqual(notes(run('challenges-formula', 'Going forward, practitioners would do well to record the denominator.')), ['looking-ahead']);
  assert.deepEqual(notes(run('challenges-formula', 'Looking forwards, the outlook remains bright.')), ['looking-ahead']);
  assert.deepEqual(notes(run('challenges-formula', 'Moving forward, the committee will meet monthly.')), ['looking-ahead']);
  assert.equal(run('challenges-formula', 'She spent the morning looking forward to the trip and going forward with the plan.').count, 0, 'not at the start of a sentence, and no comma');
});

test('M8: "To summarise," and "To sum up," close a document like "In conclusion,"', () => {
  const doc = (opener) => `The survey ran for six weeks and reached 412 households.\n\n${opener} the modern data landscape rewards patience.`;
  for (const opener of ['To summarise,', 'To summarize,', 'To sum up,', 'In closing,']) {
    assert.deepEqual(notes(run('challenges-formula', doc(opener))), ['closing-paragraph'], opener);
  }
  assert.equal(run('challenges-formula', 'To summarise the findings we built a table.\n\nThe table is below and it has four columns.').count, 0, 'only the last paragraph, and the opener needs its comma');
});

test('M8: "Bear in mind" and "Remember that" are the same aside as "Keep in mind"', () => {
  assert.deepEqual(matches(run('didactic-disclaimers', 'Bear in mind that the sample is small. Remember that rates are per 1,000 words.')), ['Bear in mind', 'Remember that']);
  assert.equal(run('didactic-disclaimers', 'I will always remember that summer, and I bear no grudge.').count, 0, 'lower case, and "bear" on its own');
});

test('M8: "I would be happy to help" and "Just say the word" are chat residue', () => {
  assert.deepEqual(matches(run('chat-residue', "I'd be happy to help you refine this further. Just say the word.")), ["I'd be happy to help", 'Just say the word']);
  assert.equal(run('chat-residue', 'The volunteers were happy to help, and nobody said the word out loud.').count, 0);
});

test('M8: "Below is a" opens a document the way "Here is a" does', () => {
  assert.deepEqual(notes(run('chat-residue', 'Below is a deeper look at the topic.\n\nThe topic is drainage.')), ['assistant opener at document start']);
  assert.equal(run('chat-residue', 'The map is on page 4. Below is a key to the symbols.').count, 0, 'only the first words of the document count');
});

test('M8: "not solely about X, but Y" is the not-just frame', () => {
  assert.deepEqual(notes(run('negative-parallelism', "It's not solely about speed, but about trust.")), ['not-just']);
  assert.equal(run('negative-parallelism', 'The grant is not available. Solely on that basis, the plan was dropped.').count, 0);
});

test('M8: analysts, commentators and "many in the industry" are the same unnamed authority', () => {
  assert.deepEqual(matches(run('vague-attribution', 'Analysts have observed a shift. Commentators contend the opposite. Many in the industry maintain that nothing changed.')),
    ['Analysts have observed', 'Commentators contend', 'Many in the industry maintain']);
  assert.equal(run('vague-attribution', 'Analysts have observed a 12% shift (Okonjo 2024). Commentators contend the opposite at https://example.org/thread.').count, 0,
    'a citation or a figure in the same sentence still excuses the claim');
});

test('M8: "an indelible impression" is the same claim as "an indelible mark"', () => {
  assert.deepEqual(matches(run('significance-inflation', 'The season left an indelible impression on the sector.')), ['indelible impression']);
  assert.deepEqual(matches(run('significance-inflation', 'It left an indelible mark.')), ['indelible mark']);
  assert.equal(run('significance-inflation', 'The ink was indelible and the impression was deep.').count, 0);
});
