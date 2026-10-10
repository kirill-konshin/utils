# Judging rules: spec-steward

Use the common rules first: [common.md](common.md). How to write a specification is in the spec-steward [model](../../../spec-steward/references/model.md).

This audit judges if the specification holds the correct rules with the correct evidence. It reports problems in the specification. Defects in the code are for spec-verify.

## Items to report

1. A REQUIRED rule that must be ⚠️ Advisory (see Severity).
2. A rule that belongs in `AGENTS.md`, a scoped rule, a skill, a command, the OpenSpec configuration or a README. The placement guide is `rules/agent.md`.
3. A rule that a deterministic tool can enforce better than an AI audit.
4. A rule that causes tests of low value or artificial tests.
5. A rule whose tests satisfy the wording while failing to protect the intent.
6. A rule that you cannot verify in a reasonable way.
7. A rule whose words permit different meanings. This includes a vague word in a REQUIRED statement (thin, safe, lean, at parity, needed).
8. A rule that describes implementation detail, not an invariant that is important outside the code.
9. A rule redundant with, or substantially overlapping, another.
10. Contradictory rules.
11. A rule that no longer matches the implementation or architecture.
12. An implementation that shows that the specification is wrong or old.
13. A missing invariant of high value that the architecture uses.
14. A rule with an unclear scope.
15. A rule that needs reasoning about the full repository when one subsystem is sufficient.
16. A rule that causes agents to change a specification only to make the code pass.
17. A rule whose verification uses comments or text matching.
18. A rule whose cost is too high for the failure that it prevents.
19. Requirements or scenarios that repeat each other.
20. A scenario structure that adds words but not precision.
21. One concern that two or more mechanisms hold. Name the owner and the copies to remove.
22. A rule that more than one repository shares, with different words.
23. A CI or audit configuration that costs more than the signal it gives.
24. Citation machinery that costs more to keep than it gives.

Items 5, 9, 10 and 11 have the same names as spec-verify's checks 5, 3, 2 and 4. spec-verify judges them against the code. This audit judges if the rule itself must change.

## How to judge

25. Find the failure that the verification of the rule catches. If that failure is trivial, artificial or only textual, do not propose that verification.
26. Do not propose a test only because a rule has no test.
27. An ordinary code defect is out of scope. The exception: it shows that the rule is not realistic, not clear, old, or contradicted.
28. When the intent is not clear, say it, give options, and set `needsHumanIntent`.
29. An internal contract that other code uses is specification. Do not move it out because it is not visible to users.
30. A proposal that reverses an owner decision names that decision.

## Severity: REQUIRED or ⚠️ Advisory

31. REQUIRED: a rule whose violation has a production effect (common rules, Production effect). This includes a contract, an invariant, security, data and performance.
32. ⚠️ Advisory: implementation detail that stays in the specification, development-only and local-only behaviour, demo agents, internal CI and developer tools, prompt wording, and design direction.
33. Split a rule that mixes a contract and guidance. The contract stays REQUIRED.
34. An existing requirement becomes Advisory only by the owner's decision. Propose it. Do not apply it.

## Proposals

35. Each proposal names its target:
    - `Keep → OpenSpec REQUIRED invariant`, with a rewrite or a `**⚠️ Known gap (<tracker>):**` line when its behaviour or evidence is missing.
    - `Reclassify → OpenSpec ⚠️ ADVISORY`.
    - `Move → <target>`: the design narrative, `<dir>/AGENTS.md`, `scoped rule (<glob>)`, `skill <name>`, `command <name>`, `openspec/config.yaml#<key>`, `README.md`.
    - `Replace → <tool>`: an ESLint rule, a dependency rule, a type assertion, a schema, a script.
    - `Merge → <other rule>`, `Rewrite → "<new text>"`, `Delete → <reason>`.

## The steward judge

36. Keep a finding that is specific, has evidence, and has a correct proposal. Change or remove a finding when:
    - it decides an unclear intent without the owner (change it: set `needsHumanIntent`);
    - it is a style preference, an ordinary defect or a guess (remove it);
    - its proposed verification catches no real failure (change or remove it);
    - it moves an internal contract out only because users cannot see it (change it);
    - it contradicts the placement guide (change it);
    - it reverses an owner decision and does not say so (change it);
    - it uses a false statement about code, tests, tools or CI (change or remove it).
37. Give `judgeConfidence`, an integer from 0 to 100. The review file puts items at 70 or lower under "Low confidence".
