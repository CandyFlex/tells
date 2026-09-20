# Instructions for coding agents working in this repository

## Before you change anything

```
npm test
```

Offline, no dependencies, under 30 seconds. It must pass before and after your change.

## Rules of the house

1. **Zero dependencies.** `dependencies` and `devDependencies` stay empty. Tests use `node:test`.
2. **No verdict.** `REPORT_SHAPE` in `src/report.mjs` is a whitelist of every key `tells/report@1` defines, and the audit fails any key that is not in it. Add a field there and to the audit in the same change, or it will not pass. Key names are tokenised before they are judged, so "underscore" in a data map is fine and `aiScore` is not. Do not add a total, a grade, a colour scale or an "overall" anything.
3. **The limits block is in every output format.** If you add a format, print `report.limits` and `report.limitsSource` in it, and add it to the test named LIMITS IN EVERY FORMAT.
4. **Every finding is locatable.** Build findings with `doc.finding(offset, length, note)` so `match` is the raw slice. Never construct one by hand.
5. **Browser-safe core.** Nothing under `src/` outside `src/node/` may import a `node:` builtin. After editing `src/`, run `npm run sync-docs`. `npm run check-docs-sync` and a test fail otherwise.
6. **ASCII source.** No literal em dash, en dash or other non-ASCII character in `src/`, `bin/`, `scripts/`, `test/*.mjs`, README, SKILL.md or this file. Write `\u{2014}` and give any regex that uses it the `u` flag. Check with `node scripts/ascii-source.mjs --check <files>`. Do not check with grep: in some shells it silently matches nothing. Corpus files and test fixtures are exempt because they must contain what is detected.
7. **No typed figures.** Numbers in README.md live between generated markers. After changing a rule or the corpus: `node bin/tells.mjs corpus --date <YYYY-MM-DD>`, `npm run studies`, `node scripts/build-readme.mjs`, `npm run sync-docs`, `npm run docs-data`.

## The showcase page

- `docs/index.html` holds its computed parts between `<!-- gen:name -->` markers. `npm run docs-data` rewrites them and `docs/data.js`; `npm run check-docs-data` and a test fail when either is stale. Edit the markup outside the markers, `docs/page.mjs` (pure renderers, shared by the build and the browser) or `docs/style.css`, never the text between markers.
- The page makes no network request: no CDN, no remote font, no analytics, no `fetch`. `test/docs-page.test.mjs` enforces it. `node scripts/build-docs-data.mjs --npm` is the one command that asks the registry whether the package is published, and it records the answer in `scripts/npm-status.json` so later builds stay offline.
- Anything that quotes a sample (the manuscript, the textarea, the findings list, the audit output) carries `data-sample`. Those regions may contain the characters the tool detects. Nothing else on the page may.
8. **No fabricated proof.** No testimonials, user counts, star counts or "trusted by". An attribution you cannot check is marked unverified (see `realm` in `src/rules/lexicon.mjs`), not asserted.
9. **Do not mention other tools** by this author anywhere in this repository.

## Adding or changing a rule

- One module per rule in `src/rules/`, word lists in `src/rules/lexicon.mjs`, registered in `src/rules/index.mjs`.
- The `description` must contain a sentence beginning "False positive:". The module header explains the false positives at more length.
- Add one positive fixture and one negative fixture that a naive regex would flag, in `test/rules.test.mjs`.
- `baseline` is `null` unless you can cite a published rate with a URL. Mark an arXiv source `(preprint)` in its label.
- `historical: true` means off by default, reached with `--include <id>` or `--historical`. Use it when a rule is kept but should not run unasked, and say why in the description.
- A match must start and end on a whole word, and its `match` must be the evidence a reader would quote. A span that shows part of what the rule claims to have found is a bug.
- Never edit a file under `corpus/` to make a rule look better. If you change a rule after looking at corpus output, say so in the study README; the table is in-sample and already says it is.

## Corpus

- Human texts are cut by `scripts/fetch-corpus.mjs` (network; never run by tests). Machine texts are written once from the prompt recorded in `corpus/MANIFEST.json` and never edited afterwards.
- After any corpus change run `node scripts/build-corpus.mjs` to recompose hybrids and restamp hashes.

## Commits

Explain why, not only what. Commit under the identity your local git config provides. Do not push; see RELEASE.md.
