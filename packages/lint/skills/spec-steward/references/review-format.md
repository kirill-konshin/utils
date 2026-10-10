# Review file format

An audit's findings go to the owner as one Markdown review file. The owner answers each item, and the file stays as the audit trail across rounds. `steward review render` writes items in this format; `steward review lint` checks it; `steward review verify --root NAME=path` checks that every quote is found where its location says; `steward review status` counts the answers.

## Items

Each item has a scan line and five bullets. The bullet labels are fixed — the parser reads them.

```md
### R-007 · SPEC-ADVISORY · SHOP checkout · 1, 6

- Rule: “The public HTTP API is the ONLY surface a client may target”
    - Location: `SHOP openspec/specs/checkout/spec.md:20`
    - What’s wrong: <the concrete problem>. Evidence: `src/checkout/server.ts:59`.
    - Proposed: Reclassify → OpenSpec ⚠️ ADVISORY — <exactly what to do>
    - My response: ⬜
```

- **Scan line**: `### R-NNN · <owning layer> · <area> · <criteria numbers>`, plus `· ❓ intent` when the intent is ambiguous and the item proposes options.
- **Rule**: the original text, quoted verbatim, so the owner recognises the rule without opening the file. Use `…` to elide.
- **Location**: `` `NAME path:line` ``, where NAME is the repository and path is repository-relative.
- **Proposed**: starts with the target notation of [criteria.md](criteria.md#proposals-name-their-target).

## Theme items

When several rules share one problem and one solution, they become a single theme item. Its Rule bullet lists the members, each with its own quote and location.

```md
### R-012 · DELETE · Theme: Scenarios that restate their requirement · 19, 20

- Rule: “Scenarios that restate their requirement” — 3 rules:
    - “WHEN the module is evaluated THEN no instance exists until the factory runs” — `SHOP openspec/specs/checkout/spec.md:31`
    - “…” — `BILLING openspec/specs/invoices/spec.md:88` — member-specific note
    - Location: each member above
    - What’s wrong: …
    - Proposed: …
    - My response: ⬜
```

The owner gives one verdict for the whole theme, or comments under individual members by adding indented lines below a member. A rule appears in exactly one item. A second, distinct problem with the same rule becomes its own item, cross-referencing the first.

## Responses

| The owner writes | Meaning                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| `⬜`             | open — not yet answered                                                   |
| `✅`             | accept the proposal                                                       |
| `✅ <comment>`   | accept, with the clarification or instruction in the comment              |
| `<comment>`      | neither accepted nor rejected: interpret the comment and revisit the item |
| `❌`             | reject: keep the rule as it is                                            |
| `❌ <comment>`   | reject, and follow the comment instead                                    |

Silence is never approval. An item left at ⬜ is open.

## After a round

Processing a round ([apply.md](apply.md)) adds to the file and never deletes from it:

- **An applied item** gets `   * Applied: R<round> — <what changed, with paths>` after its response.
- **A comment-only item** is revisited. The previous answer moves into `   * Previous response (R<n>): …`, the proposal is revised in place, and the response resets to `⬜`.
- **New findings** go under `## Round <n> — new`, numbered after the last item, so resolved items stay recognisable as the trail.
