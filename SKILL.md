---
name: tells
description: Lint prose for known signs of LLM-generated text and report each one with a rule, a line and column, and a count. Use when someone asks which passages of a draft read as machine-written, wants a pre-publish check for pasted chat debris, or has been accused of using AI and wants to see what surface features a reader or detector might be reacting to. Never use it to decide who wrote something. It cannot.
---

# tells

A linter. It counts surface features and says where they are. It does not produce a probability, cannot determine authorship, and does not rewrite.

## What you must not do with it

- Do not tell anyone a text "is AI" or "is human" from this output. No rule supports that, and the tool's own corpus shows a human text with the highest dash rate and a machine text with almost no findings.
- Do not add up rule counts or invent a score. Rules overlap, and the report deliberately has none.
- Do not state a number that is not in the report. Quote `count`, `per1k`, `line` and `col` from the JSON.
- Do not drop the limits block when you summarise. Repeat at least its first line: Tells cannot determine authorship.
- Do not offer to make text "undetectable". If asked to edit, fix the passages the person chooses, for the reader's sake.

## Run it

```
node bin/tells.mjs <file> --format json --out report.json
```

Use `-` for stdin. Add `--plain` for a file that is not Markdown. Add `--historical` to turn on every off-by-default rule, or `--include <id>` for one of them (`rule-of-three`, `didactic-disclaimers`). Use `--only a,b` or `--ignore a,b` with ids from `node bin/tells.mjs rules`.

A run narrowed by `--only` or `--ignore` carries a `partialRun` block and prints `partial run: N of M rules`. If you narrow a run, say so when you report: the rules that did not run cannot report anything, so an absence is not a result.

Exit code 0 is normal even with many findings. 1 means a gate you asked for tripped. 2 means a usage error; read stderr.

## Read the report

1. `rates.reliable`. If false the document is under 300 words: talk about counts, not per-1k rates.
2. `totals.byWeight.strong`. Strong findings are pasted chat debris (`chat-residue`, `model-artifacts`). Show each one with its `line:col` and `match`. They show text passed through a chat interface. They do not show who wrote the rest.
3. For each rule with findings, read `weight`. For weak rules only the density means anything; say so. For `vocabulary`, look at findings with `aggregate: true` (clusters), not single hits.
4. `baseline`. Only `em-dash` has one. `aboveBaseline` compares against 3.23 per 1k (human nonprofessional prose) and is `null` under 300 words, where the tables say "too short to rate" instead. Always mention that literary human prose is reported at 4.8 to 6.5 and that the comparison is weak.
5. Before calling anything a problem, run `node bin/tells.mjs rules` and read that rule's "False positive:" sentence. If the finding fits the false positive, say that.
6. `stats` is descriptive only. Never grade it.

## Report to the person

Give locations and let them decide. The shape of a good summary (the figures here are made up to show the form; yours come from the report):

> 14 findings in 6 rules, none strong. Most are weak: 5 bold spans and 4 three-item lists. The one cluster worth reading is lines 8 to 10, where "vibrant", "pivotal" and "testament" sit within 40 words. This does not say who wrote it; Tells cannot determine authorship.

## Verify a report someone gives you

```
node bin/tells.mjs audit report.json --against <file>
```

PASS means every finding is where it says, every excerpt is the document's own words, the arithmetic and the statistics recompute, the limits block and its citation are intact, every rule's weight, category and baseline match this build's registry, the reproduce command selects the rules the report says it ran, no key outside the schema was added, and replaying the rules yields the same findings. FAIL lines name what is wrong. Do not rely on a report that fails.

PASS does not mean the document is the one the writer wrote, or that `observedAt` is when the report was made. Neither is authenticated, and the README says so. An audit proves a report and a text agree.

## Other commands

- `render <file> --out view.html`: annotated HTML with margin notes. No script, no network.
- `redact report.json --out public.json`: withholds path and command; still audits.
- `corpus`: reruns the repository's corpus and prints the rates table. The table is in-sample and is not an accuracy claim.
