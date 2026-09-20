/**
 * lexicon.mjs: every word list and every source, in one place.
 *
 * WHERE THE LISTS COME FROM. The three era lists below are copied from the
 * "High density of AI vocabulary words" section of Wikipedia's "Signs of AI
 * writing" (CC BY-SA 4.0), as that page read on 2026-09-19. The guide sorts
 * the words by the model generation that overused them, and says two things
 * this file is bound by:
 *
 *   - take the list literally: a listed word does not implicate its synonyms
 *   - one or two hits mean nothing; a cluster is the signal
 *
 * KOBAK. Kobak et al. (arXiv:2406.07016) compared word frequencies in PubMed
 * abstracts before and after ChatGPT. `kobak: true` below means one of two
 * checkable things: the guide attaches its Kobak reference to that word (read
 * from the page's wikitext on 2026-09-19), or the word is one of the six this
 * project's research notes confirmed from the paper (interestingly, notably,
 * importantly, delve, elucidate, leverage). It is never set from memory.
 * "realm" was listed in this project's build brief as a Kobak word and could
 * not be confirmed either way, so it is kept and marked `unverified: true`.
 * "deep dive" and "robust" are in the guide's words-to-watch box but not in
 * its era breakdown, so their `eras` are empty.
 *
 * Inflections are matched (the guide's own highlighted examples include
 * "highlighted", "underscores" and "emphasize"), synonyms are not.
 *
 * Every one of these is an ordinary English word. A landscape painter writes
 * "landscape". This file lists words to count, not words to ban.
 */

export const SOURCES = {
  wikipedia: {
    label: 'Wikipedia: Signs of AI writing (CC BY-SA 4.0), as read 2026-09-19',
    url: 'https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing',
  },
  // Every arXiv entry says "preprint". Labelling only the blog as not peer
  // reviewed implied by contrast that the rest were refereed, and none of
  // these four has been checked against a journal version by this project.
  kobak: {
    label: 'Kobak et al., Delving into LLM-assisted writing in biomedical publications through excess vocabulary, arXiv:2406.07016 (preprint)',
    url: 'https://arxiv.org/abs/2406.07016',
  },
  freeburg: {
    label: 'Freeburg 2026, The Last Fingerprint: How Markdown Training Shapes LLM Prose, arXiv:2603.27006 (preprint)',
    url: 'https://arxiv.org/abs/2603.27006',
  },
  emergence: {
    label: 'Em-ergence of the em-dash, arXiv:2606.29540 (preprint; 3.33-fold rise in medRxiv Discussion sections, 95% CI 3.05-3.63)',
    url: 'https://arxiv.org/abs/2606.29540',
  },
  literaryDashes: {
    label: 'SlopDetector, em-dash rates in literary human prose (a blog analysis, not peer reviewed)',
    url: 'https://slopdetector.org/blog/em-dash-ai-tell-data',
  },
  liang: {
    label: 'Liang et al., GPT detectors are biased against non-native English writers, Patterns 2023 (peer reviewed; preprint at arXiv:2304.02819)',
    url: 'https://arxiv.org/abs/2304.02819',
  },
  gptzero: {
    label: 'GPTZero, Perplexity and burstiness: what is it? (the vendor describing its own retired method)',
    url: 'https://gptzero.me/news/perplexity-and-burstiness-what-is-it/',
  },
};

export const ERAS = {
  'gpt-4': '2023 to mid-2024',
  'gpt-4o': 'mid-2024 to mid-2025',
  'gpt-5': 'mid-2025 on',
};

const E1 = 'gpt-4';
const E2 = 'gpt-4o';
const E3 = 'gpt-5';

/**
 * word     the label reported for every inflection
 * pattern  regex source, matched whole-word and case-insensitively
 * eras     which of the guide's era lists name it
 * kobak    see KOBAK above
 * caution  the ordinary use that makes a single hit meaningless
 */
export const VOCABULARY = [
  { word: 'additionally', pattern: 'additionally', eras: [E1], kobak: false },
  { word: 'align with', pattern: 'align(?:s|ed|ing)? with', eras: [E2], kobak: true },
  { word: 'boasts', pattern: 'boast(?:s|ed|ing)?', eras: [E1], kobak: false, caution: 'literal boasting' },
  { word: 'bolster', pattern: 'bolster(?:s|ed|ing)?', eras: [E1, E2], kobak: true },
  { word: 'crucial', pattern: 'crucial(?:ly)?', eras: [E1, E2], kobak: false },
  { word: 'deep dive', pattern: 'deep dives?', eras: [], kobak: false, caution: 'scuba' },
  { word: 'delve', pattern: 'delv(?:e|es|ed|ing)', eras: [E1], kobak: true },
  { word: 'elucidate', pattern: 'elucidat(?:e|es|ed|ing)', eras: [], kobak: true },
  { word: 'emphasizing', pattern: 'emphasi[sz](?:e|es|ed|ing)', eras: [E1, E2, E3], kobak: true },
  { word: 'enduring', pattern: 'enduring', eras: [E1, E2], kobak: true },
  { word: 'enhance', pattern: 'enhanc(?:e|es|ed|ing)', eras: [E2, E3], kobak: true },
  { word: 'foster', pattern: 'foster(?:s|ed|ing)?', eras: [E2], kobak: true, caution: 'foster care, a surname' },
  { word: 'garner', pattern: 'garner(?:s|ed|ing)?', eras: [E1], kobak: true },
  { word: 'highlighting', pattern: 'highlight(?:s|ed|ing)?', eras: [E2, E3], kobak: false, caution: 'the noun, as in the highlight of a trip' },
  { word: 'importantly', pattern: 'importantly', eras: [], kobak: true },
  { word: 'interestingly', pattern: 'interestingly', eras: [], kobak: true },
  { word: 'interplay', pattern: 'interplay', eras: [E1], kobak: true },
  { word: 'intricate', pattern: 'intrica(?:te|tely|cy|cies)', eras: [E1], kobak: true },
  // "key" is on the guide's list as an adjective. Matched only before another
  // word, and never before the prepositions and verbs that follow the noun.
  { word: 'key', pattern: 'key(?=\\s+(?!to\\b|in\\b|is\\b|was\\b|for\\b|on\\b|of\\b|and\\b|or\\b|that\\b|which\\b|with\\b|from\\b|lime\\b|west\\b|signature\\b)[a-z])', eras: [E1], kobak: false, caution: 'a compound noun such as key card' },
  { word: 'landscape', pattern: 'landscapes?', eras: [E1], kobak: false, caution: 'actual landscapes' },
  { word: 'leverage', pattern: 'leverag(?:e|es|ed|ing)', eras: [], kobak: true, caution: 'financial leverage' },
  { word: 'meticulous', pattern: 'meticulous(?:ly)?', eras: [E1], kobak: true },
  { word: 'notably', pattern: 'notably', eras: [], kobak: true },
  { word: 'pivotal', pattern: 'pivotal', eras: [E1, E2], kobak: true },
  { word: 'realm', pattern: 'realms?', eras: [], kobak: false, unverified: true, caution: 'fantasy and monarchy' },
  { word: 'robust', pattern: 'robust(?:ly|ness)?', eras: [], kobak: false, caution: 'statistics, where robust is a term of art' },
  { word: 'showcasing', pattern: 'showcas(?:e|es|ed|ing)', eras: [E2, E3], kobak: true },
  { word: 'tapestry', pattern: 'tapestr(?:y|ies)', eras: [E1], kobak: false, caution: 'woven ones' },
  { word: 'testament', pattern: 'testaments?', eras: [E1], kobak: false, caution: 'wills and scripture' },
  { word: 'underscore', pattern: 'underscor(?:e|es|ed|ing)', eras: [E1, E2], kobak: true, caution: 'the _ character' },
  { word: 'valuable', pattern: 'valuable', eras: [E1], kobak: false },
  { word: 'vibrant', pattern: 'vibrant', eras: [E1, E2], kobak: false },
];

/** A cluster is this many distinct list words inside this many running words. */
export const CLUSTER_WINDOW_WORDS = 150;
export const CLUSTER_MIN_DISTINCT = 3;

export const COPULA_SUBSTITUTES = [
  'serv(?:e|es|ed|ing) as', 'st(?:and|ands|ood|anding) as', 'function(?:s|ed|ing)? as',
  'operat(?:e|es|ed|ing) as', 'represent(?:s|ed)? an?', 'mark(?:s|ed) an?', 'boast(?:s|ed)?',
  'featur(?:es|ed) an?', 'offer(?:s|ed) an?', 'refer(?:s|red) to',
];

export const ING_PARTICIPLES = [
  'highlighting', 'underscoring', 'emphasizing', 'emphasising', 'reflecting', 'symbolizing', 'symbolising',
  'showcasing', 'ensuring', 'contributing to', 'fostering', 'cultivating', 'encompassing', 'enhancing',
  'demonstrating', 'signaling', 'signalling', 'marking', 'solidifying', 'cementing',
];

// Longest alternatives first, so "pivotal role" is one finding and not two.
export const SIGNIFICANCE = [
  '(?:crucial|vital|key|pivotal|significant) role', 'underscor(?:e|es|ed|ing) the importance',
  'testament to', 'indelible (?:mark|impression|imprint)', 'deeply rooted', '(?:ever-)?evolving landscape', 'focal point',
  'set(?:s|ting)? the stage', 'key turning point', 'reflect(?:s|ed|ing)? (?:a )?broader',
  '(?:enduring|lasting) legacy', 'st(?:ands|ood|and) as an?', '(?:is|are|was|serves as|serve as) a (?:\\w+ )?reminder',
  'pivotal',
];

export const PUFFERY = [
  'rich (?:cultural )?(?:history|tapestry|heritage)', 'in the heart of', 'diverse array', 'commitment to',
  'state-of-the-art', 'world-class', 'cutting-edge', 'seamless(?:ly)?', 'unparalleled', 'must-visit',
  'breathtaking', 'groundbreaking', 'renowned', 'nestled', 'profound(?:ly)?', 'vibrant', 'boast(?:s|ed|ing)?',
];

export const VAGUE_ATTRIBUTION = [
  'experts (?:say|argue|agree|believe|note|suggest)', 'studies (?:show|suggest|have shown|indicate)',
  'research (?:shows|suggests|has shown|indicates)', 'industry reports', 'observers(?: have)? (?:say|note|noted|cited|argue)',
  '(?:some )?critics (?:argue|say|contend)', 'it is widely (?:believed|known|regarded|accepted|considered)',
  // The unnamed authority has a small stock of names, and a 2026 review wrote
  // the same appeal three more ways before the list caught any of them.
  'analysts(?: have)? (?:say|said|note|noted|observe|observed|argue|contend|suggest)',
  'commentators(?: have)? (?:say|said|note|noted|observe|observed|argue|contend|maintain)',
  'many in the (?:industry|field|sector|profession) (?:say|believe|argue|maintain|agree)',
  'many (?:believe|argue|say)', 'some (?:say|argue|believe)', 'according to (?:some|many)', 'several sources',
];

export const VAGUE_ASSOCIATION = ['in connection with', 'in association with', 'associated with', 'connected to', 'linked to'];

export const TRANSITION_OPENERS = [
  'Additionally', 'Moreover', 'Furthermore', 'In addition', 'Overall', 'Ultimately', 'In conclusion', 'Notably',
  'Importantly', 'Interestingly', 'Crucially', 'In summary', 'That said', "In today's",
];

export const CLOSING_OPENERS = [
  'In conclusion', 'Overall', 'Ultimately', 'In summary',
  'To summari[sz]e', 'To sum up', 'In closing',
];

export const CHALLENGE_HEADINGS = [
  'Challenges and (?:Future|Legacy|Outlook)[^\\n]*', 'Challenges and (?:the )?Road Ahead',
  'Future (?:Outlook|Directions|Prospects)', '(?:The )?Road Ahead', 'Looking ahead',
];

export const CHAT_RESIDUE = [
  { pattern: 'As an AI(?: language model| assistant)?', note: 'assistant self-reference' },
  { pattern: 'As of my (?:last )?(?:knowledge )?(?:cutoff|update)', note: 'knowledge-cutoff disclaimer' },
  { pattern: "I don't have access to real-time", note: 'knowledge-cutoff disclaimer' },
  { pattern: 'I hope this helps', note: 'reply to a user' },
  { pattern: 'Let me know if', note: 'reply to a user' },
  { pattern: 'Would you like me to', note: 'reply to a user' },
  { pattern: 'Feel free to', note: 'reply to a user' },
  { pattern: "I(?:'d| would) be happy to help", note: 'reply to a user' },
  { pattern: 'Just say the word', note: 'reply to a user' },
  { pattern: 'Great question', note: 'reply to a user' },
  { pattern: "I can't help with", note: 'refusal' },
];

/** These count only at the start of a line: "Sure!" mid-sentence is speech. */
export const CHAT_LINE_OPENERS = ['Certainly!', 'Sure!', 'Of course!', 'Absolutely!'];

/** These count only as the first words of the document. */
export const CHAT_DOCUMENT_OPENERS = ["Here's an?", 'Here is an?', 'Here are', 'Below is an?', 'Below are'];

/**
 * Markup that only exists because text was pasted out of a chat product.
 * `weight` overrides the rule's weight for that one pattern.
 */
export const MODEL_ARTIFACTS = [
  { pattern: ':?contentReference\\[oaicite:\\d+\\](?:\\{index=\\d+\\})?', product: 'ChatGPT' },
  { pattern: 'oai_citation(?::\\d+)?', product: 'ChatGPT' },
  { pattern: 'oaicite(?::\\d+)?', product: 'ChatGPT' },
  { pattern: 'contentReference', product: 'ChatGPT' },
  { pattern: 'turn\\d+(?:search|view|news|image)\\d+', product: 'ChatGPT' },
  { pattern: 'attributableIndex', product: 'ChatGPT' },
  { pattern: '\\[cite:\\s*\\d+(?:\\s*,\\s*\\d+)*\\]', product: 'Gemini' },
  { pattern: '\\[span_\\d+\\]\\((?:start|end)_span\\)', product: 'Gemini' },
  { pattern: 'grok_render_citation_card_json', product: 'Grok' },
  { pattern: 'grok_card', product: 'Grok' },
  { pattern: '\\u{3010}[^\\u{3011}\\n]{0,40}\\d[^\\u{3011}\\n]{0,40}\\u{3011}', product: 'ChatGPT or DeepSeek (lenticular citation brackets)' },
  { pattern: 'ppl-ai-file-upload', product: 'Perplexity' },
  { pattern: 'attached_file(?::\\d+)?', product: 'Perplexity' },
  { pattern: ':::writing', product: 'unclassified' },
  { pattern: 'utm_source=[\\w.-]*', product: 'a link copied out of a chat product, or out of any newsletter', weight: 'weak' },
];

export const DIDACTIC_DISCLAIMERS = [
  "It's important to note", 'It is important to note', "It's worth noting", 'It is worth noting',
  'Keep in mind', 'Bear in mind', 'It should be noted', 'Note that', 'Remember that',
];

/**
 * Matched with their capital only. Lower-cased they are ordinary prose: "she
 * left a note that said goodbye", "I will always remember that summer".
 */
export const CAPITALISED_DISCLAIMERS = ['Note that', 'Remember that'];

export const EM_DASH_BASELINE = {
  per1k: 3.23,
  label: 'human nonprofessional prose (Freeburg 2026, preprint)',
  alt: [
    { per1k: 4.8, label: 'literary human prose, low end (SlopDetector, not peer reviewed)' },
    { per1k: 6.5, label: 'literary human prose, high end (SlopDetector, not peer reviewed)' },
  ],
  machine: [{ per1k: 10.62, label: 'GPT-4.1 on matched prompts (Freeburg 2026, preprint)' }],
};
