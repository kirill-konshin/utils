# Audit worker

This file tells how one worker of the corpus-quality audit runs. `spec-tools workers --audit spec-steward` starts one worker per unit of the scope. Its brief names the unit, the files to read and the findings file to write. The procedure around the workers is [audit.md](audit.md).

What to judge is in the judging rules: [`common.md`](../../spec-tools/references/rules/common.md), then [`spec-steward.md`](../../spec-tools/references/rules/spec-steward.md). How a specification is written is [model.md](model.md). Where guidance belongs is the placement guide, `rules/agent.md` of this package. Read them before you judge.

The audit is read-only. You write your findings file and nothing else. Your tools are Read, Glob, Grep, Write and the read-only git commands. Other commands are denied and only cost a turn.

## Your unit

- **A part** is a set of capabilities. Each capability has its evidence file under `.spec-audit/parts/`: each requirement with its line, the tests bound to it, where its terms occur, and its related requirements. Read the evidence files and the specifications they name. Read code and tests where a verdict depends on them. Each requirement of the part is in a finding (on it or on one of its scenarios) or in `sound`. Each requirement you judged is in `judged`.
- **A sweep** looks across the corpus from one angle. Its focus names the items to report. Read the files the brief lists. `judged` and `sound` can stay empty.

## The findings file

Write one finding for each rule and problem. A rule can be a requirement, a scenario, a sentence, or, outside the specifications, a section or line of `AGENTS.md`, a skill, a configuration, a script or a CI job. Write the file with the Write tool, at the path the brief names:

```yaml
findings:
    - file: 'openspec/specs/billing/refunds/spec.md'
      line: 12
      quote: |-
          The service SHALL apply a refund at most once per request id
      ruleName: 'Refunds are idempotent'
      criteria:
          - 6
          - 7
      layer: 'SPEC-ADVISORY'
      whatsWrong: |
          The rule names no failure that a test can catch. Its tests assert only the text of the log line.
      proposed: |
          Reclassify → OpenSpec ⚠️ ADVISORY — mark the requirement Advisory and remove the log-text test.
      evidence:
          - 'src/refunds.ts:40'
      themeKey: 'unverifiable-absolute'
      needsHumanIntent: false
      readerConfidence: 75
sound:
    - 'billing/refunds#requirement-a-refund-names-its-order'
judged:
    - 'billing/refunds#requirement-refunds-are-idempotent'
    - 'billing/refunds#requirement-a-refund-names-its-order'
notes: []
```

How to write each key:

- `file`, `ruleName`, `layer`, `themeKey`, `reversesPastDecision`: double-quoted strings. `file` is relative to the repository.
- `line`, `criteria[]`, `readerConfidence`: plain integers. `line` is where the quoted text starts. `readerConfidence` is from 0 to 100 ([common rules](../../spec-tools/references/rules/common.md#confidence)).
- `quote`: a stripped literal block (`|-`), copied from that line, at most 300 characters. Use `…` where you leave text out. The merge looks for the quote at its line and drops a finding whose quote is not there.
- `whatsWrong`, `proposed`: literal blocks (`|`), in ASD-STE100.
- `evidence`, `crossRefs`, `sound`, `judged`, `notes`: block lists of double-quoted strings. Address a requirement as `capability#requirement-slug`.
- `needsHumanIntent`: `true` or `false`.

What each key holds:

- `criteria`: the item numbers of the [steward rules](../../spec-tools/references/rules/spec-steward.md#items-to-report).
- `proposed`: starts with the target notation (`Keep →`, `Reclassify →`, `Move →`, `Replace →`, `Merge →`, `Rewrite →`, `Delete →`) and tells exactly what to do. A rewrite gives the new text. A move names the target file.
- `layer`: the layer you propose as the owner: `SPEC-REQUIRED`, `SPEC-ADVISORY`, `DESIGN`, `AGENTS`, `RULE`, `SKILL`, `COMMAND`, `OPSX-CONFIG`, `README`, `TOOLING`, `TEST`, `CI`, `MERGE`, `REWRITE` or `DELETE`.
- `themeKey`: a kebab-case name for the problem under the finding. The merge groups the findings that share a key into a theme. Use a key that another finding uses for the same problem, for example `impl-detail-in-spec`, `advisory-not-required`, `restating-scenario`, `tooling-should-enforce`, `duplicate-rule` or `stale-rule`. When no key fits, make a new one.
- `reversesPastDecision`: the owner decision that the proposal reverses. Leave it out when there is none.
- `sound`: the requirements that you judged correct, in the correct place, and with sufficient evidence.
- `judged`: each requirement that you judged, with or without a finding. A requirement of your part that is not in `judged` goes to a completion worker.

When you stop, the tool checks the file. If the file has errors, the tool sends them back to you, and you correct the file. Then return one line: the path and your count of findings.
