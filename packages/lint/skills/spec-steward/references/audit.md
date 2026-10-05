# Audit procedure

An audit asks whether the corpus holds the **right** rules with the **right** evidence. It judges by [model.md](model.md) and [criteria.md](criteria.md), places guidance by `rules/agent.md`, and produces a review file ([review-format.md](review-format.md)). Nothing in the specifications or the code changes during an audit. Whether the code conforms to the specifications is not its question; that is the repository's own conformance audit.

## 1. Mechanical inputs

Run these for every repository in scope. With several repositories, pass `--root NAME=path` for each.

- `steward check` (add `--base auto` or `--base <ref>` for a change): heuristic candidates. They are leads, not verdicts.
- `steward index`: counts (capabilities, requirements, Advisory requirements, Known gaps, scenarios), and the citation inventory split into bindings and pointers, with how many of them dangle.
- `steward evidence --out <dir>`: one bundle per capability. A bundle holds each requirement verbatim with line numbers, the tests bound to its scenarios ([contract.md](contract.md#binding)), code citations as pointers, where its terms occur, and related requirements across capabilities and repositories.
- `steward coverage --out <file>`: bindings, Advisory requirements and Known gaps per capability.
- The repository's own gates and reports, when it has them.

## 2. Fan out

One reader cannot hold a corpus, so partition it.

- **Parts.** Group a handful of related capabilities per part, and keep same-named capabilities from different repositories together so drift is judged in place. `steward partition --parts N` balances by size. Hand-made parts are fine when the architecture suggests better groups.
- **Sweeps.** Each sweep looks across the corpus from one angle:
    - tooling and CI
    - tests citing the corpus (compliance theatre)
    - comments and citations
    - a whole-corpus reader for duplicates, contradictions and cross-repository wording
    - missing invariants
    - the CI run classes
    - placement against `rules/agent.md` (duplicated concerns, AGENTS.md hierarchy, scoped rules, skills)
- **Maps first.** An architecture map, an enforcement map and the owner's decision history go to every reader, so no one re-derives them.

With Claude Code's Workflow tool, run [`workflows/audit.js`](../workflows/audit.js). It takes the arguments documented at its top and returns verified, consolidated findings and themes. Without it, start one subagent per part and per sweep in waves, give each this procedure and its files, and run the verification below yourself.

## 3. Verify every finding twice

1. **Facts.** Is the quote verbatim at its line? Are the evidence references real, and does the code or test do what the finding claims?
2. **Judgement.** The verifier acts as a skeptic and looks for these failures:
    - **silent intent**: the finding decides an ambiguous intent without saying so. Revise it to offer options.
    - **not a spec problem**: style, an ordinary bug, or speculation. Drop it.
    - **compliance theatre**: the proposed verification catches no real failure. Revise or drop.
    - **misplaced contract**: an internal contract moved out of the spec only because it is not user-facing. Revise.
    - **wrong layer**. Revise.
    - **unstated reversal** of a past owner decision. Revise to state it.
    - **duplicate**. Drop the weaker one.

## 4. Completeness

A critic looks for capabilities with neither findings nor a sound list, criteria that yielded nothing where the corpus plainly has cases, unread sources, and shared capabilities not compared. Its gaps become targeted follow-up units. Loop until a round finds nothing new; two rounds is usually enough.

## 5. Consolidate and render

- **Merge duplicates per area.** The same rule with the same problem becomes one finding.
- **Form themes.** Several rules with one solution become one item with members.
- **Render** with `steward review render <result.json> --out <review.md> [--sections layout.json]`.
- **Check** with `steward review lint` and `steward review verify --root NAME=path …`.
- **Read every item yourself**: sharpen the wording, fix what the readers got wrong, and order the sections so decisions that others depend on come first.
- **Close with an appendix** listing the requirements judged sound, so coverage is visible.

Hand the file to the owner and stop.
