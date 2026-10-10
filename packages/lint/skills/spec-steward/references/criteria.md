# Audit criteria

An audit judges whether the corpus holds the **right** rules with the **right** evidence — specification quality first, implementation compliance only where code reveals a problem with the rule. Read [model.md](model.md) first.

## What deserves an item

Every rule, requirement or scenario that matches one of these, numbered so findings can name them:

1. A REQUIRED rule that should be ⚠️ ADVISORY.
2. A rule that belongs in `AGENTS.md`, a scoped rule, a skill, a command, the OPSX config or a README rather than the specification (place it per `rules/agent.md`).
3. A rule better enforced by deterministic tooling than by an AI audit.
4. A rule that produces low-value or artificial tests.
5. A rule whose tests satisfy the wording while failing to protect the intent. (`spec-verify` check 5 judges it against the code.)
6. A rule that cannot reasonably be verified.
7. A rule whose wording allows materially different interpretations. An undefined evaluative term in a REQUIRED statement (_thin_, _safe_, _lean_, _at parity_, _needed_) is a finding: replace it with the criterion it stands for, drop the sentence where a precise rule already carries the obligation, or, when nothing checkable remains, make it ⚠️ ADVISORY.
8. A rule that describes implementation detail instead of an externally meaningful invariant.
9. A rule redundant with, or substantially overlapping, another. (`spec-verify` check 3.)
10. Contradictory rules. (`spec-verify` check 2.)
11. A rule that no longer matches the implementation or architecture. (`spec-verify` check 4 judges it against the code.)
12. Implementation suggesting the specification itself is wrong or outdated.
13. A missing high-value invariant the architecture clearly relies on.
14. A rule whose scope is unclear.
15. A rule that forces repository-wide reasoning where a subsystem scope would do.
16. A rule that encourages agents to modify specifications merely to make an implementation pass.
17. A rule whose verification relies on comments or superficial textual matching.
18. A tiny rule whose maintenance and enforcement cost is disproportionate to the failure it prevents.
19. Requirements or scenarios that repeat each other.
20. Scenario/When/Then structure that adds verbosity without precision.

Organisational criteria, for the mechanisms around the corpus:

21. The same concern held by two or more mechanisms (spec, design, `AGENTS.md`, scoped rule, skill, command, OPSX config, tooling, test, audit) — name the authoritative one and the copies to remove.
22. A rule shared by several repositories but worded differently.
23. A CI or audit configuration whose cost buys no signal, or whose classification of a run is wrong.
24. Citation machinery whose upkeep exceeds its value.

## How to judge

- **Ask what failure the verification would catch.** If the answer is trivial, artificial, coupled to implementation, or proves only textual or structural conformity, do not propose that verification.
- **Do not create compliance theatre.** Never propose a test merely because a rule lacks one.
- **Comments are never evidence and never a violation.** Judge executable behaviour and structure.
- **Two markers, nothing else.** A requirement is REQUIRED, or carries `**⚠️ Advisory:**`; absent behaviour or missing evidence is a `**⚠️ Known gap (<tracker>):**` line ([model.md](model.md#advisory-known-gap-or-neither), spellings in [contract.md](contract.md#markers)). A retired `**⚠️ Unenforced:**`, an untracked Known gap and an unmarked silence are findings, and a proposal never introduces one.
- **Ordinary bugs are out of scope** unless they show the rule is unrealistic, unclear, outdated, ambiguous, or contradicted by the tests' actual contract.
- **Do not decide intent silently.** Where the intent is ambiguous, say so and propose options; flag `needsHumanIntent`.
- **Do not flag style preference.** Every finding has a concrete reason.
- **Internal contracts are specification.** Do not move a rule out of the corpus because it is not user-facing.
- **Past owner decisions are stated.** A proposal that reverses one names it.

## Proposals name their target

Start every proposal with one of:

- `Keep → OpenSpec REQUIRED invariant` (optionally with a rewrite, or with a `**⚠️ Known gap (<tracker>):**` line when its behaviour or its evidence is missing)
- `Reclassify → OpenSpec ⚠️ ADVISORY` (the requirement gains an `**⚠️ Advisory:**` line; one that mixes a contract with guidance is split, the contract staying REQUIRED)
- `Move → <target>` — the design narrative (the repository's design documents or a package README), `<dir>/AGENTS.md`, `scoped rule (<glob>)`, `skill <name>` (referenced from `AGENTS.md` when it holds material moved out of it), `command <name>`, `openspec/config.yaml#<key>`, `README.md`
- `Replace → <tool>` — ESLint rule, dependency rule, type assertion, schema, script
- `Merge → <other rule>`
- `Rewrite → "<new text>"`
- `Delete → <reason>`
