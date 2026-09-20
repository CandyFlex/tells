# Changelog

## 0.1.0 (2026-09-19)

First version. Not yet published; see RELEASE.md.

- Document model with Markdown-aware masking. Code, inline code, URLs, link targets, HTML tags, front matter and blockquotes are blanked to equal length, so offsets never move and every finding is locatable at line:col in UTF-16 code units.
- Eighteen rules, one module each, word lists in one lexicon. Sixteen run by default; `rule-of-three` and `didactic-disclaimers` are off unless asked for with `--include <id>` or `--historical`. Every rule description states what a false positive looks like, and says why it is off by default when it is. Only `chat-residue` and `model-artifacts` are weighted strong.
- Report `tells/report@1` whose set of keys is closed: `REPORT_SHAPE` is a whitelist and the audit fails any key outside it, so no score, rating, probability or verdict can be added without failing. The four-line limits block, with the Liang et al. 61% citation, is part of the schema. `document` carries both a normalised hash and the hash of the file's bytes.
- Formats: text, json, md, SARIF 2.1.0. The limits block is printed by all of them and by the rendered HTML view.
- `audit` recomputes or pins every field a report carries: locations, excerpts, counts, rates, `aboveBaseline`, totals, the statistics block, the rates block, the partial-run block, sha256, the limits block and its citation, every rule's name, category, weight and baseline against this build's registry, the consistency of the reproduce command with the recorded options, and a replay of the rules that catches findings invented or removed. The README lists what it cannot know.
- CLI: exit 0 by default, `--fail-on` and `--max` as opt-in gates, `--include` for one off-by-default rule, `rules`, `audit`, `render`, `redact`, `corpus`. A run narrowed by `--only` or `--ignore` prints `partial run: N of M rules` in every format. `tells rules` states the limits first.
- Corpus of 14 files with a manifest that records every URL, licence, model and verbatim prompt, a dated study with the first-run results kept beside the final ones, and a rates table the README labels in-sample.
- Descriptive statistics, reported and never judged.
- Showcase page in `docs/`: the sample linted on load by the copy of the linter in `docs/lib`, a live panel, the limits, the rules index and the corpus as small multiples. It makes no network request, and a test reads the markup, stylesheet and scripts to hold it to that. `npm run docs-data` writes `docs/data.js` and stamps the computed regions of `docs/index.html`; a test fails when either is stale.

Changed from the unreleased starter that preceded this version: negative parallelism and trailing -ing clauses are no longer weighted strong, the exit code no longer fails on a strong finding by default, and the sentence-uniformity ("burstiness") density was removed as a measure and kept only as an unjudged statistic.
