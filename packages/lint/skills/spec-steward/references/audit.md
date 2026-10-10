# Audit procedure

An audit asks if the corpus holds the correct rules with the correct evidence. Its judging rules are [`common.md`](../../spec-tools/references/rules/common.md) and [`spec-steward.md`](../../spec-tools/references/rules/spec-steward.md). It writes a review file ([review-format.md](review-format.md)). Nothing in the specifications or the code changes during an audit. If the code agrees with the specifications is the `spec-verify` audit's question.

## 1. Run the engine

Both audits run on one engine, `spec-tools` (the `spec-tools` skill), one repository per run. Wording drift between repositories is [align](../SKILL.md#align). The full sequence, from a detached tree of `HEAD` (`--here` for uncommitted edits):

```bash
spec-tools audit --audit spec-steward --context <decisions file>
```

It runs locally, on the owner's request. No pipeline runs it. `--context` passes a file of established facts and earlier owner decisions (earlier review answers, the decision log) into each worker's and judge's brief, so that no finding reverses a decision without saying so.

It runs these passes. Each is also a command of its own:

1. `spec-tools scope --audit spec-steward`: the evidence, cut into parts that one reader holds, plus one unit per [sweep](../sweeps.json) (tooling and CI, tests citing the corpus, comments and citations, missing invariants, placement). It writes `.spec-audit/steward/scope.yaml`.
2. `spec-tools workers --audit spec-steward`: one headless worker per unit, under [worker.md](worker.md). Each writes `.spec-audit/steward/findings/part-<n>-<reader>.yaml`. The tool checks each file and sends its errors back to the worker.
3. `spec-tools report --audit spec-steward`: the merge. It looks up each quote at its line and drops a finding whose quote is not there. It lists the requirements that no worker judged as short.
4. `spec-tools workers --complete --audit spec-steward`: the short requirements, judged again. Then the merge again.
5. `spec-tools workers --verify --audit spec-steward`: one judge per finding, under the steward judge rules. It keeps, revises or drops the finding and gives `judgeConfidence`. Then the last merge joins duplicates (one rule, one problem), offers the findings that share a `themeKey` as a theme, and renders `.spec-audit/spec-review.yaml`.

The run's data is `.spec-audit/steward/review-data.yaml`: the themes and findings, the dropped findings with the reason, the requirements judged sound, the short list and the workers' notes.

## 2. Consolidate and hand back

- **Read each item yourself.** Make the wording clear and in ASD-STE100, correct what the readers got wrong, and decide each theme: keep it as one item when its members share one solution, split it when they do not.
- **Order the items** so that a decision that others depend on comes first.
- **List the requirements judged sound** at the end, in a YAML comment, so that the coverage is visible.
- **Check** with `steward review lint .spec-audit/spec-review.yaml` and `steward review verify .spec-audit/spec-review.yaml --root NAME=path …`.

Give the file to the owner and stop.
