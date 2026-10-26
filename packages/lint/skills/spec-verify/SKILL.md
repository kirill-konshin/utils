---
name: spec-verify
description: Audit whether the code satisfies the intent of the OpenSpec specifications; its verdict gates CI. Finds what no tool can - cross-capability contradictions, code that misses a requirement's intent, bound tests that do not assert their scenario, gaps nobody recorded. Use for a code-conformance audit (`spec-tools audit`) or after changing a capability (`/spec-verify changed`). Not for corpus quality (the `spec-steward` skill).
model: claude-haiku-5-5
effort: high
---

# Verify spec adherence

This skill tells how the audit runs. What to judge is in the judging rules: [`common.md`](../spec-tools/references/rules/common.md), then [`spec-verify.md`](../spec-tools/references/rules/spec-verify.md). Read them before you judge. The tooling's contract (scope, partition, merge, verdict) is the `spec-tools` skill's `references/contract.md`.

There are three ways in:

- A reader: the brief names a part and a findings file. Follow _The reader_.
- `/spec-verify changed`: _Focused mode_.
- `/spec-verify` from an operator: _Interactive use_.

The audit is read-only. No reader changes code or specifications. A reader writes its own findings file and nothing else.

## What tools do, not this skill

Do not report what these report:

- `openspec validate` and `spec-tools gates`: the corpus gates (structure, citations, binding, markers, size, the scenario ratchet).
- `spec-tools scope`: the scope, the partition and the evidence of each part.
- `spec-tools report`: the merge. It caps each severity by the kind rules and re-proves the quotes of an ERROR-band finding at their `file:line`, combines the judge's reading with the reader's, gives each finding its tier, and computes the verdict.
- `spec-tools steward coverage`: which requirements and scenarios a test binds.

## Focused mode — `/spec-verify changed`

`spec-tools changed` has already written `.spec-audit/parts/changed.yaml`: the affected set of the working tree, as the `AUDIT_AFFECTED_*` variables tune it, each requirement with its bound tests, where its terms occur, and its related requirements in full. You are the one reader. Read that file. Run checks 2, 3 and 4 over those requirements. Print the findings in the conversation, each with its severity and confidence. Do not start workers or write a file.

## The material

`spec-tools scope` writes two inputs. In CI they arrive as artifacts. Do not produce them.

- `.spec-audit/scope.yaml`: the parts. Each part has its number, the evidence `files` its reader reads, and the `requirementIds` it judges.
- `.spec-audit/parts/<capability>.yaml`: the evidence. Each requirement is there with its `id`, `location` and `block`, then its `boundTests` (each with `location`, `binds` and `code`), its `terms` and `occurrences`, and its `related` requirements. A bound test with a `window` is cut: read the file at those lines before you judge it. A bound test with `sameAs` is quoted under that other requirement.

Address a requirement as `<capability>#<slug>`.

## The reader

The tool starts one reader per part, then a completion reader for each part that is short, then one judge for each finding that is severe and sure enough (`AUDIT_JUDGE_FROM`, `AUDIT_JUDGE_MIN_CONFIDENCE`). The tool combines the judge's reading with the reader's. The judge's rules are [`spec-verify-judge.md`](../spec-tools/references/rules/spec-verify-judge.md); the judge loads no skill.

A reader judges checks 1–5 over every requirement of its part, writes its findings file, and returns one line: the path and its counts per band (ERROR, WARN, INFO). When the reader stops, the tool checks the file. If the file has errors, the tool sends them back, and the reader corrects the file.

## The findings file

Write it with the Write tool, at the path the brief names: `.spec-audit/parts/findings/part-<n>-<reader>.yaml`. Its shape:

```yaml
part: 1
reader: 1
capabilities:
    - 'billing/refunds'
findings:
    - kind: 'code-mismatch'
      readerSeverity: 85
      where: 'billing/refunds#requirement-a-refund-is-applied-once / src/refunds.ts:6'
      readerConfidence: 80
      quotes:
          - file: 'openspec/specs/billing/refunds/spec.md'
            line: 12
            text: |-
                The service SHALL apply a refund at most once, however often it is retried.
          - file: 'src/refunds.ts'
            line: 6
            text: |-
                await ledger.credit(refund.amount);
      detail: |
          The handler credits the ledger on each retry. A retried refund pays twice.
coverage:
    '1': 'full'
    '2': 'full'
    '3': 'full'
    '4': 'full'
    '5': 'full'
judged:
    - 'billing/refunds#requirement-a-refund-is-applied-once'
notes:
    - 'billing/refunds#requirement-x and billing/invoices#requirement-y overlap in their words; no shared term paired them'
```

How to write each key:

- `kind`, `where`, `file`: double-quoted strings.
- `readerSeverity`, `readerConfidence`, `line`, `part`, `reader`: plain integers. Each finding has a `readerSeverity` and a `readerConfidence`, on the scales of the common rules.
- `detail`: a literal block (`|`), one or two sentences. The report shows its first sentence.
- `quotes[].text`: a stripped literal block (`|-`), copied from the source line without its line-number prefix. A finding with a severity in the ERROR band has at least two quotes: one from the specification and one from the code. Without them, the tool keeps it below the ERROR band. A quote from `.spec-audit/` or from installed dependency code (`node_modules/`) does not count: the audit judges the repository's own code. Findings below the ERROR band need no quotes.
- `coverage`: one string per check, `"1"` to `"5"`: `"full"`. Write `"sampled: <the source>"` only when a source was not available after you tried to read it. The tool keeps it as a note; it does not change the verdict.
- `judged`: every requirement id of the part that you judged. A missing id leaves the run short until the completion pass judges it.
- Every path you name exists. Do not write a bare file name.

## Interactive use — `/spec-verify`

Run `spec-tools audit` (`--here` judges the uncommitted edits). Then summarize `.spec-audit/spec-verify.md` in ASD-STE100, one line for each finding, most severe first:

`⟨ERROR|WARN|INFO⟩ <capability>#requirement-<slug> <file>:<line> — <kind> — severity <n> at <n>% — <one sentence>`

End with the counts per band. Without an operator (no AskUserQuestion tool), stop there. With an operator, ask once what to do next (rerun, fix the errors, fix errors and warnings, go one by one, stop), and do nothing until the operator answers. For each fix, propose the side to change (code or specification), and edit nothing until the operator confirms. After the fixes, run `spec-tools changed`, judge as in _Focused mode_, and run the checks the repository's `AGENTS.md` lists.

`spec-tools report` writes `.spec-audit/spec-verify.md`. Its first line is the verdict CI reads. You never write it.
