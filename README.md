# tells

Tells is a linter for prose that reads as machine-written. Point it at a document and it returns the specific passages that match known signs of LLM-generated text, each with a rule name, a line and column, and a count. It reports a count and a rate per 1,000 words per rule, against a published baseline where one exists. It does not produce an "AI probability". It cannot determine authorship, and it says so on every report. It does not rewrite anything.

The second audience is the person wrongly accused. Liang et al. (Patterns, 2023, [arXiv:2304.02819](https://arxiv.org/abs/2304.02819)) found seven commercial detectors flagged an average of 61% of essays by non-native English writers as machine-written because those detectors key on low perplexity, not on machine origin. Tells shows a writer which surface features of their own text a reader or a detector might react to, with line numbers, so they can decide what to do.

There is no key named score, rating, probability or verdict anywhere in the output. The report is checked against a whitelist of the keys its schema defines, and a key that is not in it fails the audit.

## Limits, before anything else

These four lines are printed on every report in every format, and `tells audit` fails a report where they are missing or edited:

1. Tells cannot determine authorship.
2. No single rule is evidence on its own; the guide this draws on says the same.
3. Seven detectors flagged an average of 61% of TOEFL essays by non-native English writers as machine-written (Liang et al. 2023); surface features are not origin.
4. This report does not make text undetectable and does not try to.

What follows from them:

- A person can write every pattern here. A model can write none of them. In this repository's own corpus, a machine text written to avoid the patterns produces almost no findings, and a passage by Mark Twain has the highest dash rate of any file. Both results are in the table below.
- Most rules have no baseline, because nobody has published a rate this project could cite. Where that is so the report says "none published" and makes no comparison.
- The same words can be counted by more than one rule ("boasts" is on the vocabulary list, is a copula substitute, and is puffery). Rule counts are not independent, so they are never summed into anything.
- English only. The word lists and patterns are English.
- **Every rule is a closed list of literal phrases.** There is no synonym expansion and no morphology beyond the inflections written into each pattern. "Despite its challenges" is counted and "Notwithstanding its hurdles" was not until someone added the word; "Looking ahead," is counted and "Looking onward," is not. One-word paraphrase defeats any rule here, so an absence of findings is not evidence that the habit is absent. Read the rule descriptions as a list of strings, not as a description of a concept.
- On this repository's own corpus, exactly 1 of 18 rules separates the human files from the machine files: the lowest machine rate is above the highest human rate for `vocabulary` and for nothing else. The table below gives that comparison rule by rule.
- The Markdown handling is a line scanner, not a CommonMark parser. Lazy blockquote continuation lines and setext headings are not recognised.

## Use it

Requires Node 20 or newer. Zero dependencies.

From a clone of this repository:

```
node bin/tells.mjs test/fixtures/constructed-machine.md --only chat-residue
```

The first lines of the output (the fixture is a constructed scenario, written for the tests):

```
tells 0.1.0  test/fixtures/constructed-machine.md
103 words, 10 sentences, 5 paragraphs, 26 lines  sha256 379e497a191c
Counts and locations. Not a verdict: Tells cannot determine authorship.
options: plain=false historical=false only=chat-residue ignore=- include=-
partial run: 1 of 18 rules; rules skipped: vocabulary, copula-avoidance, ...

chat-residue  (strong)  2 counted, 19.42 per 1k words
  test/fixtures/constructed-machine.md:25:1  chat-residue  I hope this helps  [reply to a user]  | I hope this helps!
  test/fixtures/constructed-machine.md:25:20  chat-residue  Let me know if  [reply to a user]  | Let me know if you would like a shorter version.
```

(The skipped list is printed in full; it is cut here to fit the page.)

Every finding is `path:line:col  rule  match  | excerpt`. Columns are 1-based UTF-16 code units. A run narrowed by `--only` or `--ignore` says so on the second header line, in every format, because "No findings." over a hidden `--ignore` list is the cheapest lie this program could tell. After the findings come the per-rule table, descriptive statistics, the limits block, and the command that reproduces the report.

The package is staged for npm as `tells` and is not published yet. See RELEASE.md. Once it is, `npx tells draft.md` runs the same program.

```
tells <file|-> [--format text|json|md|sarif] [--plain] [--historical]
      [--only rule,rule] [--ignore rule,rule] [--include rule,rule]
      [--out file] [--fail-on strong|moderate|any] [--max rule=N ...]
tells rules                       list rules with weight, baseline, source
tells audit <report.json> --against <file>
tells render <file> [--out file.html]
tells redact <report.json> [--out file]
tells corpus [dir] [--date YYYY-MM-DD]
```

| option | what it does |
|---|---|
| `--format` | `text` (default), `json`, `md` for pasting into a pull request, `sarif` (2.1.0) for code scanning |
| `--plain` | turn Markdown-aware masking off. URLs are still masked |
| `--historical` | turn on every off-by-default rule (`rule-of-three`, `didactic-disclaimers`) |
| `--include` | turn on one off-by-default rule, e.g. `--include rule-of-three` |
| `--only`, `--ignore` | comma-separated rule ids. Either one makes the run print `partial run: N of M rules` in every format |
| `--out` | write to a file and create missing directories |
| `--fail-on strong` | exit 1 only when an artifact rule fires: chat residue or model debris |
| `--fail-on moderate`, `any` | exit 1 on any moderate-or-strong finding, or on any finding |
| `--max em-dash=5` | exit 1 when a rule's count exceeds N. Repeatable |

Exit code is 0 by default. Tells is diagnosis, not a gate: a document full of findings is still a document. 1 means a gate you asked for tripped or an audit failed. 2 means the usage was wrong.

## Rules

`node bin/tells.mjs rules` prints every rule with its full description, which always says what a false positive looks like, its baseline and its sources.

<!-- rules:start -->
| rule | category | weight | baseline |
|---|---|---|---|
| `vocabulary` | vocabulary | moderate | none published |
| `copula-avoidance` | vocabulary | weak | none published |
| `negative-parallelism` | structure | moderate | none published |
| `rule-of-three` | structure | weak (historical, off by default) | none published |
| `em-dash` | punctuation | weak | 3.23 per 1k, human nonprofessional prose (Freeburg 2026, preprint) |
| `ing-analysis` | structure | moderate | none published |
| `significance-inflation` | vocabulary | moderate | none published |
| `puffery` | vocabulary | weak | none published |
| `vague-attribution` | attribution | moderate | none published |
| `vague-association` | attribution | weak | none published |
| `transition-openers` | structure | weak | none published |
| `challenges-formula` | structure | moderate | none published |
| `inline-header-lists` | formatting | moderate | none published |
| `bold-overuse` | formatting | weak | none published |
| `heading-style` | formatting | weak | none published |
| `chat-residue` | artifact | strong | none published |
| `model-artifacts` | artifact | strong | none published |
| `didactic-disclaimers` | structure | weak (historical, off by default) | none published |
<!-- rules:end -->

Two rules are off by default and are turned on with `--include <id>` or `--historical`. `didactic-disclaimers` is off because it describes a 2023 habit that has faded. `rule-of-three` is off because it separates nothing: see the corpus table, where its top human rate is 4.5 per 1,000 words and its lowest machine rate is 0.0.

Weight says how much one finding means alone. weak: common in careful human writing, so only the density means anything. moderate: a recognisable habit, where a handful in a short document is a pattern. strong: not a style at all but debris from a chat interface, where one hit deserves to be read. Only the two artifact rules are strong, and even those show that text passed through a chat interface, not who wrote the sentences around it.

`vocabulary` reports every hit and also clusters: 3 or more distinct list words inside 150 running words. The source guide says clustering is the signal and single hits are not. A cluster is marked `aggregate: true`, spans the run, and is not added to the rule's count.

`vague-attribution` drops a finding when the same sentence or the next one has a URL, a bracketed citation, a year in parentheses or a number with a unit. "Studies show a 23% drop (Hwang 2019)" produces nothing.

## Masking

On by default. Fenced and indented code, inline code, URLs, link targets, HTML tags, front matter and blockquotes are replaced by spaces of equal length before the vocabulary, punctuation, structure and attribution rules run. A code sample containing `delve` produces nothing, a URL with a dash in it is not punctuation, and a quotation is somebody else's prose. Offsets never move, so every finding still points at the right place in the file as written. Formatting rules read a view where only code is blanked.

## The report, and auditing it

`--format json` writes a `tells/report@1` object: `document` (path, sha256, bytesSha256, counts), `observedAt`, `options`, `partialRun`, `rules` (each with `count`, `per1k`, `baseline`, `aboveBaseline`, and `findings` holding `line`, `col`, `offset`, `length`, `match`, `excerpt`, `note`), `stats`, `totals`, `rates`, `limits`, `limitsSource`, `command`. `sha256` is taken after line endings are normalised, so the same prose hashes the same on a CRLF checkout; `bytesSha256` is the file as it sits on disk, which is what `sha256sum` prints. The set of keys is closed: `src/report.mjs` holds `REPORT_SHAPE`, a whitelist of every key the schema defines, and the audit fails any key that is not in it.

`stats` holds descriptive statistics: sentence and paragraph length, type-token ratio over the first 500 words, repeated sentence openers. They are reported and never judged. GPTZero, the vendor that popularised perplexity and burstiness, stopped using them in 2023, and keying on plain, even prose is how detectors came to flag second-language writers.

`audit` recomputes every field of the report from the document, or compares it to a value pinned in this source tree:

```
node bin/tells.mjs test/fixtures/constructed-machine.md --format json --out report.json
node bin/tells.mjs audit report.json --against test/fixtures/constructed-machine.md
```

```
  PASS  32 findings in 16 rules recomputed from the document. 0 warning(s), 0 critical.
```

Recomputed from the document: every finding's line, column, length and `match`; every finding's `excerpt`, rebuilt from the text and compared string for string; every rule's `count`, `per1k` and `aboveBaseline`; `totals`; the whole `stats` block; the `rates` block with its below-300-words warning; the `partialRun` block; the document `sha256` and every count in `document`. Then the rules are replayed with the recorded options and any finding invented or removed fails the run. That replay is what catches a report whose worst line was deleted and whose counts were fixed up to match.

Compared to values pinned in this build: the `limits` block word for word, the citation under it, and every rule's `name`, `category`, `weight` and `baseline`, which come from the registry and not from the report. Checked for internal consistency: the reproduce command must select the rules the report says it ran, so a report analysed with `--ignore` over every rule and relabelled `tells draft.md` fails rather than printing a clean bill of health. `observedAt` is checked for shape only. Exit 1 on any failure.

**What the audit cannot know.** It proves that a report and a text agree. It does not prove:

- that the document handed to it is the document the writer wrote. Anyone can write a text, run Tells on it, and present both.
- when the report was made. `observedAt` is a string the report carries and there is no signature and no trusted clock, so a backdated stamp passes. It is checked for format and nothing else.
- who ran it, on what machine, or whether `document.path` names a real file. Those are labels; only their internal consistency is checked.
- whether the rules are any good. The audit proves arithmetic, not linguistics. The corpus table below is the evidence about the rules, and it is in-sample.

`redact` withholds the file path and the command line, records what it removed, and leaves everything the audit needs, so a redacted report still passes against the same document. It does not remove matched text. If the text itself is private, do not publish a report about it.

## Code scanning

SARIF 2.1.0. Each rule is a `reportingDescriptor` with a `helpUri`. Weak findings are level `note`, moderate and strong are `warning`, and nothing is ever `error`.

The limits block is in four places in the file: each rule's `fullDescription.text` and `help.text`, `runs[0].properties.limits`, and `invocations[0].toolExecutionNotifications`. It is in the first two because GitHub code scanning renders results, `fullDescription` and `help`, and does not render `toolExecutionNotifications`. If the limits were only in the notifications, the one consumer this recipe recommends would be the one consumer that never sees them.

`artifacts[0].hashes['sha-256']` is the hash of the file's bytes, so `sha256sum` reproduces it on a CRLF checkout. The hash the report is identified by is taken after line endings are normalised and is kept beside it as `artifacts[0].properties.normalisedSha256`.

```yaml
- run: npx tells README.md --format sarif --out tells.sarif
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: tells.sarif
```

In the code-scanning UI each alert reads "A count, not a verdict." and the full limits block is under the rule's description, where GitHub does render it. Nothing in that UI knows who wrote the file.

To fail a build only on pasted chat debris:

```
node bin/tells.mjs test/fixtures/constructed-machine.md --fail-on strong
```

That exits 1 and prints `tells: --fail-on strong: 2 finding(s) in chat-residue` to stderr.

## Corpus

`corpus/` holds 14 files of known origin: six public-domain or CC BY-SA human texts written before 2020, six texts written by a language model, and two human passages with one machine paragraph inserted. `corpus/MANIFEST.json` records where each came from, its licence, and for every machine text the model, the date and the verbatim prompt.

**The rates below are in-sample.** The rules were revised after looking at the first corpus run, and one rule (`rule-of-three`) was taken out of the default set after a hostile review read this table and a set of eight human passages written for that review. The first run is kept unedited in `studies/2026-09-19-corpus/first-run-results.json`, and the study README lists every cell that moved, why, and what the demotion was for. No corpus text was changed at any point, and no machine text was edited after the linter first ran on it. The machine texts were also written by an author who had read the rule list. Treat this table as a demonstration of what the rules count, on files they were tuned against. The table runs every rule, including the two that are off by default, because it is the evidence for why they are off.

<!-- corpus:start -->
Observed 2026-09-19 with tells 0.1.0. Reproduce: `node bin/tells.mjs corpus --date 2026-09-19`

| file | kind | words | voc | cop | neg | r3 | dash | ing | sig | puf | attr | assoc | trans | chal | ihl | bold | head | chat | art | didac | strong |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| lincoln-gettysburg | human | 268 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0 |
| twain-german | human | 1548 | 0.0 | 0.0 | 0.0 | 0.0 | 18.1 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0 |
| madison-federalist-10 | human | 1543 | 0.7 | 0.0 | 0.0 | 1.9 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0 |
| thoreau-walden | human | 1690 | 0.6 | 0.0 | 0.0 | 0.0 | 3.5 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.6 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0 |
| darwin-origin | human | 1708 | 0.0 | 0.0 | 0.0 | 0.6 | 2.9 | 0.0 | 0.0 | 0.6 | 0.0 | 0.0 | 0.6 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0 |
| wikipedia-shelby-2019 | human | 1339 | 0.8 | 0.0 | 0.0 | 4.5 | 0.0 | 0.0 | 0.0 | 0.8 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.8 | 0.0 | 0.0 | 0.0 | 0 |
| about-us | machine | 536 | 5.6 | 0.0 | 1.9 | 3.7 | 7.5 | 0.0 | 0.0 | 5.6 | 0.0 | 0.0 | 0.0 | 0.0 | 9.3 | 11.2 | 3.7 | 0.0 | 0.0 | 0.0 | 0 |
| cover-letter | machine | 389 | 10.3 | 0.0 | 2.6 | 5.1 | 2.6 | 2.6 | 2.6 | 5.1 | 0.0 | 0.0 | 0.0 | 0.0 | 10.3 | 10.3 | 0.0 | 0.0 | 0.0 | 0.0 | 0 |
| biography | machine | 565 | 7.1 | 3.5 | 0.0 | 0.0 | 1.8 | 1.8 | 5.3 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 1.8 | 3.5 | 0.0 | 0.0 | 0.0 | 0 |
| blog-restaurant | machine | 571 | 3.5 | 0.0 | 1.8 | 5.3 | 7.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 3.5 | 1.8 | 7.0 | 7.0 | 8.8 | 0.0 | 0.0 | 0.0 | 0 |
| essay-broadband | machine | 637 | 6.3 | 0.0 | 3.1 | 0.0 | 1.6 | 3.1 | 0.0 | 0.0 | 1.6 | 0.0 | 3.1 | 4.7 | 0.0 | 0.0 | 1.6 | 0.0 | 0.0 | 0.0 | 0 |
| about-us-evasion | machine | 579 | 0.0 | 0.0 | 0.0 | 1.7 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 1.7 | 0.0 | 0.0 | 0.0 | 0 |
| hybrid-walden | hybrid | 1074 | 0.0 | 0.9 | 0.0 | 1.9 | 2.8 | 0.0 | 0.0 | 0.0 | 0.9 | 0.0 | 2.8 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0 |
| hybrid-federalist | hybrid | 1122 | 3.6 | 0.0 | 0.9 | 3.6 | 0.0 | 1.8 | 0.9 | 0.0 | 0.0 | 0.0 | 1.8 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0 |

Cells are findings per 1,000 words. "strong" is a count of chat-debris findings. Columns: voc = vocabulary, cop = copula-avoidance, neg = negative-parallelism, r3 = rule-of-three, dash = em-dash, ing = ing-analysis, sig = significance-inflation, puf = puffery, attr = vague-attribution, assoc = vague-association, trans = transition-openers, chal = challenges-formula, ihl = inline-header-lists, bold = bold-overuse, head = heading-style, chat = chat-residue, art = model-artifacts, didac = didactic-disclaimers.

The machine samples were written by the same model family that built the linter; rates in this table describe these files and are not an accuracy claim about any detector, including this one.

What this table shows, computed from `corpus/results.json` by `scripts/build-readme.mjs`:

- The highest em-dash rate in the corpus belongs to a human: 18.1 per 1k in `twain-german` (human). The published figure for GPT-4.1 on matched prompts (Freeburg 2026, preprint) is 10.62. Machine files here range from 1.6 to 7.5. Dash density does not identify an author.
- `vocabulary` is 0.0 to 0.8 per 1k in the human files and 3.5 to 10.3 in the five machine files written without an avoidance instruction.
- For 5 of 18 rules the highest human rate reaches or passes the lowest machine rate: `rule-of-three`, `em-dash`, `puffery`, `transition-openers`, `heading-style`. For those rules a rate alone separates nothing, even in-sample. The five machine files written without an avoidance instruction are used for that floor; counting `about-us-evasion` as well makes it 6 of 18.
- Counted the other way round: 1 of 18 rules separate the two groups here, meaning their lowest machine rate is above their highest human rate and is not zero: `vocabulary`. The remaining 17 do not.

Top human rate against the lowest rate in the five machine files written without an avoidance instruction, per 1,000 words:

| rule | top human | lowest machine | separates here |
|---|---:|---:|---|
| `vocabulary` | 0.8 | 3.5 | yes |
| `copula-avoidance` | 0.0 | 0.0 | no |
| `negative-parallelism` | 0.0 | 0.0 | no |
| `rule-of-three` | 4.5 | 0.0 | no |
| `em-dash` | 18.1 | 1.6 | no |
| `ing-analysis` | 0.0 | 0.0 | no |
| `significance-inflation` | 0.0 | 0.0 | no |
| `puffery` | 0.8 | 0.0 | no |
| `vague-attribution` | 0.0 | 0.0 | no |
| `vague-association` | 0.0 | 0.0 | no |
| `transition-openers` | 0.6 | 0.0 | no |
| `challenges-formula` | 0.0 | 0.0 | no |
| `inline-header-lists` | 0.0 | 0.0 | no |
| `bold-overuse` | 0.0 | 0.0 | no |
| `heading-style` | 0.8 | 0.0 | no |
| `chat-residue` | 0.0 | 0.0 | no |
| `model-artifacts` | 0.0 | 0.0 | no |
| `didactic-disclaimers` | 0.0 | 0.0 | no |

- 4 rules found nothing in any file: `vague-association`, `chat-residue`, `model-artifacts`, `didactic-disclaimers`. This corpus says nothing about them.
- The evasion sample is machine text and has 2 findings in 579 words. Evasion sample against the plain sample. vocabulary: 5.6 per 1k (3) in about-us, 0 per 1k (0) in about-us-evasion, lower. negative-parallelism: 1.87 per 1k (1) in about-us, 0 per 1k (0) in about-us-evasion, lower. Rules where the evasion sample is level or higher: none.
- Localisation in the hybrids: `hybrid-walden`: the inserted paragraph is 11.4% of the words and holds 7 of 10 findings; `hybrid-federalist`: the inserted paragraph is 11.4% of the words and holds 10 of 14 findings.
<!-- corpus:end -->

`node bin/tells.mjs corpus` refuses to run if a corpus file is not in the manifest, if a machine text has no recorded prompt, or if a file no longer matches its recorded hash. The human texts can be re-fetched from their recorded URLs with `node scripts/fetch-corpus.mjs` (the only script here that uses the network; no test runs it).

## As a library

Everything under `src/` except `src/node/` is pure ESM with no `node:` imports and runs in a browser unchanged.

```js
import { analyze, audit, formatText } from 'tells';

const report = analyze(markdownString, { path: 'draft.md' });
console.log(formatText(report));
audit(report, markdownString).ok; // true
```

## Development

```
npm test
npm run check-docs-sync
```

`npm test` runs offline with `node:test` and no dependencies. `docs/lib/` is a byte-for-byte copy of the browser-safe part of `src/`, and a test fails when they differ.

## Credits

The rule catalogue draws on Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing) (CC BY-SA 4.0), maintained by the editors of WikiProject AI Cleanup. It is the most systematic public catalogue of these patterns, and its caveats (no single sign is proof; people write this way too) are the ones this tool repeats. The era word lists in `src/rules/lexicon.mjs` are taken from that page as it read on 2026-09-19.

Figures: em-dash rates from Freeburg, The Last Fingerprint ([arXiv:2603.27006](https://arxiv.org/abs/2603.27006)), with the literary-prose range from a SlopDetector blog analysis that is not peer reviewed. Excess vocabulary from Kobak et al. ([arXiv:2406.07016](https://arxiv.org/abs/2406.07016)). Detector bias from Liang et al. ([arXiv:2304.02819](https://arxiv.org/abs/2304.02819)).

The Wikipedia revision in the corpus is by Wikipedia contributors, CC BY-SA 4.0; its entry in the manifest links the exact revision and lists the changes made. The other human texts are from Project Gutenberg and are in the public domain in the United States.

## License

MIT. Copyright (c) 2026 Jarred O'Brien.
