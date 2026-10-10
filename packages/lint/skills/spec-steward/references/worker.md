# Audit worker

What one worker of the corpus-quality audit does. `spec-tools workers --audit spec-steward` starts one per unit of the scope and names, in its brief, the unit, the files to read and the findings file to write. The audit's procedure around the workers is [audit.md](audit.md).

## The standard

Read these first, in full — they are what you judge by: [model.md](model.md), [criteria.md](criteria.md), and the placement guide, `rules/agent.md` of this package.

- Specification quality first. An ordinary implementation bug is out of scope unless it reveals the rule is unrealistic, unclear, outdated, ambiguous, or contradicted by what the tests actually assert. Whether code conforms is the `spec-verify` audit's.
- Comments, descriptions, prompt text and citations are never evidence that code complies, and never a violation by themselves. Judge executable behaviour and structure.
- For every rule you would keep REQUIRED, ask what meaningful failure its verification catches. Never propose a test merely because a rule lacks one, and never a test of incidental text or structure.
- Internal component and API contracts are legitimate specification. The line is contract versus implementation or process, not product versus engineering.
- Do not decide intent silently: when the meaning is ambiguous, describe the readings, propose options and set `needsHumanIntent`.
- No style preferences: every finding states a concrete problem.
- A proposal that reverses an earlier owner decision says so, in `reversesPastDecision`.
- Quote the original text verbatim, from the line you name; open the file to confirm before writing it.

The audit is read-only: you write your findings file and nothing else. Your tools are Read, Glob, Grep, Write and the read-only git commands; anything else is denied and only costs a turn.

## Your unit

- **A part** is a set of capabilities, each as its evidence file under `audit-parts/` quotes it: every requirement verbatim with its line, the tests bound to it, where its terms occur, and its related requirements elsewhere. Read the evidence files and the specifications they name in full, then trace into code and tests wherever a verdict depends on them. Every requirement of the part is either in a finding (on it or one of its scenarios) or in `sound`, and every one you judged is in `judged`.
- **A sweep** looks across the corpus from one angle — its focus names the criteria. Read the files the brief lists; `judged` and `sound` may stay empty.

## The findings file

One finding per rule and problem. A rule may be a requirement, a scenario, a sentence, or — outside the specifications — a section or line of `AGENTS.md`, a skill, a configuration, a script or a CI job. Write the file once with the Write tool, plain JSON:

```json
{
    "part": 3,
    "reader": 1,
    "findings": [
        {
            "file": "openspec/specs/billing/refunds/spec.md",
            "line": 12,
            "quote": "The service SHALL apply a refund at most once per request id",
            "level": "requirement",
            "ruleName": "Refunds are idempotent",
            "criteria": [6, 7],
            "layer": "SPEC-ADVISORY",
            "whatsWrong": "<the concrete problem, one or two sentences>",
            "proposed": "Reclassify → OpenSpec ⚠️ ADVISORY — <exactly what to do>",
            "evidence": ["src/refunds.ts:40"],
            "crossRefs": [],
            "themeKey": "unverifiable-absolute",
            "needsHumanIntent": false,
            "reversesPastDecision": "",
            "confidence": "high"
        }
    ],
    "sound": ["billing/refunds#requirement-a-refund-names-its-order"],
    "judged": [
        "billing/refunds#requirement-refunds-are-idempotent",
        "billing/refunds#requirement-a-refund-names-its-order"
    ],
    "notes": []
}
```

- `file` is repository-relative; `line` is where the quoted text is; `quote` is verbatim, at most 300 characters, `…` eliding. The merge looks the quote up at its line and drops a finding whose quote is not there.
- `criteria` are numbers from [criteria.md](criteria.md). `proposed` starts with the target notation (`Keep →`, `Reclassify →`, `Move →`, `Replace →`, `Merge →`, `Rewrite →`, `Delete →`) and says exactly what to do: a rewrite gives the new text, a move names the target file.
- `layer` is the owning layer you propose: `SPEC-REQUIRED`, `SPEC-ADVISORY`, `DESIGN`, `AGENTS`, `RULE`, `SKILL`, `COMMAND`, `OPSX-CONFIG`, `README`, `TOOLING`, `TEST`, `CI`, `MERGE`, `REWRITE` or `DELETE`.
- `themeKey` names the underlying problem — one of `restating-scenario`, `single-scenario-padding`, `bdd-verbosity`, `impl-detail-in-spec`, `coding-convention-in-spec`, `process-rule-in-spec`, `agent-steering-as-spec`, `tooling-should-enforce`, `textual-test`, `comment-as-evidence`, `citation-upkeep`, `unverifiable-absolute`, `vague-obligation`, `advisory-not-required`, `duplicate-rule`, `cross-repo-drift`, `contradiction`, `stale-rule`, `scope-unclear`, `repo-wide-reasoning`, `placement-duplication`, `agents-md-bloat`, `ci-cost`, `missing-invariant`, `gap-marker` — or a new kebab-case key only when none fits. The merge groups findings that share one into a theme.
- `sound` lists the requirements you judged correct, well placed and adequately evidenced, as `capability#requirement-slug`; `judged` lists every requirement you judged, finding or not. A requirement of your part missing from `judged` is judged again by a completion worker.

Be aggressive about questionable specification design and conservative about deciding intent. Then return one line: the path and your count of findings.
