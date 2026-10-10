# Audit procedure

An audit asks whether the corpus holds the **right** rules with the **right** evidence. It judges by [model.md](model.md) and [criteria.md](criteria.md), places guidance by `rules/agent.md`, and produces a review file ([review-format.md](review-format.md)). Nothing in the specifications or the code changes during an audit. Whether the code conforms to the specifications is not its question; that is the `spec-verify` audit, and the principles both judge are worded once, in [criteria.md](criteria.md).

## 1. Run the engine

Both audits run on one engine, `spec-tools` (the `spec-tools` skill), one repository per run; cross-repository wording drift is [align](../SKILL.md#align). The whole sequence, from a detached tree of `HEAD` (`--here` for uncommitted edits):

```bash
spec-tools audit --audit spec-steward --context <decisions file>
```

It runs locally, on the owner's request; no pipeline runs it. `--context` passes a file of facts already established and the owner's earlier decisions — earlier review answers, the decision log — into every worker's and verifier's brief, so no finding reverses one without saying so.

It runs these passes, each also a command of its own:

1. `spec-tools scope --audit spec-steward` — spec-steward's evidence model, cut into parts one reader holds (each capability's requirements verbatim, the tests bound to them, where their terms occur, their related requirements), plus one unit per [sweep](../sweeps.json): tooling and CI, tests citing the corpus, comments and citations, missing invariants, placement.
2. `spec-tools workers --audit spec-steward` — one headless worker per unit under [worker.md](worker.md), judging every criterion and writing its findings file, with the requirements it judged and those it found sound.
3. `spec-tools report --audit spec-steward` — the merge: every quote looked up at its line (a finding whose quote is not there is dropped, saying so); the requirements no worker judged listed as short.
4. `spec-tools workers --complete --audit spec-steward` — what the reading left short, judged once more; then the merge again.
5. `spec-tools workers --verify --audit spec-steward` — one skeptic per finding: it keeps, revises or drops for silent intent, a non-spec problem, compliance theatre, a misplaced contract, the wrong layer, an unstated reversal of an owner decision, or a false claim about code. Then the last merge folds duplicates (one rule, one problem), offers findings sharing a theme key as a theme, and renders `spec-review.md`.

The run's data, kept for the next step, is `audit-parts/steward/review.json`: the themes and findings, the dropped findings with who dropped them and why, the requirements judged sound, the short list and the workers' notes.

## 2. Consolidate and hand back

- **Read every item yourself**: sharpen the wording, fix what the readers got wrong, and decide each offered theme — keep it as one item when its members share one solution, split it when they do not.
- **Order the sections** so decisions that others depend on come first.
- **Close with an appendix** listing the requirements judged sound, so coverage is visible.
- **Check** with `steward review lint` and `steward review verify --root NAME=path …`.

Hand the file to the owner and stop.
