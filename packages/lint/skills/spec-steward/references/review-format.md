# Review file format

An audit gives its findings to the owner as one YAML review file, `.spec-audit/spec-review.yaml`. The owner answers each item in place, and the file stays as the record across rounds. `steward review render` writes the items. `steward review lint` checks the shape. `steward review verify --root NAME=path` checks that each quote is at its location. `steward review status` counts the answers.

## Items

Each item is one top-level block, keyed by its id, `R-NNN`. An item about one rule has `rule`:

```yaml
R-001:
    title: 'Implementation detail in a REQUIRED rule'
    area: 'system-overview/logging'
    layer: 'SPEC-ADVISORY'
    criteria:
        - 8
    confidence: 85
    rule:
        text: |-
            The server SHALL promote accountId, rcAccountId, rcRequestId and rcUserId…
        location: 'SHOP openspec/specs/system-overview/logging/spec.md:47'
    wrong: |
        The rule names the exact log fields. A field change breaks the rule with no effect in production.
    proposal: |
        Reclassify → OpenSpec ⚠️ ADVISORY — mark the rule Advisory, or move the field list to the logger's scoped rule.
    evidence:
        - 'src/logger.ts:12'
    decision: ''
```

An item about several rules with one problem and one solution is a theme. It has `theme` and a `rules` list:

```yaml
R-002:
    theme: 'Development-only behaviour held as REQUIRED'
    layer: 'SPEC-ADVISORY'
    confidence: 75
    rules:
        - text: |-
              WHEN the dev server starts THEN it seeds the demo account
          location: 'SHOP openspec/specs/apps/runtime/spec.md:88'
        - text: |-
              The local database SHALL reset on each start
          location: 'SHOP openspec/specs/apps/db/spec.md:12'
          note: 'the reset is also in the README'
    wrong: |
        Both rules apply only on a developer machine. A violation has no effect in production.
    proposal: |
        Reclassify → OpenSpec ⚠️ ADVISORY — mark both rules Advisory.
    decision: ''
```

The keys:

- `title` or `theme`: one line.
- `area`: the capability or the sweep that found the item.
- `layer`: the owning layer that the item proposes ([worker.md](worker.md)).
- `criteria`: the item numbers of the [steward rules](../../spec-tools/references/rules/spec-steward.md#items-to-report).
- `confidence`: an integer from 0 to 100, the judge's confidence, else the reader's. A theme takes the lowest confidence of its rules. Items at 70 or lower come after the comment `# Low confidence — 70% or lower`.
- `needsHumanIntent: true`: the intent is not clear, and the proposal gives options.
- `rule` / `rules[]`: `text` is the original text, so that the owner knows the rule without opening the file; `…` leaves text out. `location` is `NAME path:line`, where NAME is the repository and path is relative to it. `note` is the audit's remark about one member of a theme. `decision` on a member is the owner's answer for that member only.
- `wrong`: the problem, in ASD-STE100.
- `proposal`: starts with the target notation of the [steward rules](../../spec-tools/references/rules/spec-steward.md) (`Keep →`, `Reclassify →`, `Move →`, `Replace →`, `Merge →`, `Rewrite →`, `Delete →`).
- `evidence`, `crossRefs`, `reversesPastDecision`: present only when they have content.
- `decision`: the owner's answer. It starts empty.

A rule is in one item only. A second problem with the same rule is its own item, with a `crossRefs` entry to the first.

## Decisions

| The owner writes in `decision` | Meaning                                                                    |
| ------------------------------ | -------------------------------------------------------------------------- |
| `""` or `"⬜"`                 | open: not answered                                                         |
| `"✅"`                         | accept the proposal                                                        |
| `"✅ <comment>"`               | accept, with the instruction in the comment                                |
| `"<comment>"`                  | not accepted and not rejected: read the comment and examine the item again |
| `"❌"`                         | reject: keep the rule as it is                                             |
| `"❌ <comment>"`               | reject, and do what the comment tells                                      |

The owner can answer one member of a theme with a `decision` on that member, in the same form. No answer is never approval. An empty `decision` is open.

## After a round

Processing a round ([apply.md](apply.md)) adds to the file and never removes from it:

- **An applied item** gets `applied: "R<round> — <what changed, with paths>"`.
- **A comment-only item** is examined again. The comment moves into `previousDecision`, the proposal changes in place, and `decision` becomes `""` again.
- **New findings** come after the comment `# Round <n> — new`, numbered after the last item, so that the resolved items stay as the record.
