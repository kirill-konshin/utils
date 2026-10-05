---
name: spec-steward
description: Guard, audit and repair an OpenSpec specification corpus. Use when auditing specs for corpus quality (the whole corpus, a change, or one capability), producing or processing a spec review file (review rounds where the owner answers items with ⬜ / ✅ / ❌), aligning rules shared by several repositories, wiring the spec guard (edit hook, AGENTS.md routing, OPSX config) into a repository, or when the repository's spec gate, `spec-steward check` or the edit hook reports a finding. Deterministic scripts do the mechanical work; the skill supplies the procedure. It does not audit code conformance; the repository's own conformance audit does — the `verify-spec` skill where the repository has one.
---

# Spec steward

Procedures for an OpenSpec corpus. Four things live elsewhere and are not repeated here:

- the hard constraints for editing specs — the scoped rule `.agents/rules/openspec.md`
- where any guidance belongs — `.agents/rules/agent.md`
- the specification model (REQUIRED versus ⚠️ ADVISORY, Known gaps, the evidence ladder, what is not evidence, how requirements and scenarios are written) — [references/model.md](references/model.md)
- what the gate checks and emits (citations, binding, markers, size lines, the scenario ratchet, base resolution, exit codes, the coverage report, the evidence JSON) — [references/contract.md](references/contract.md)

`steward` below means the `spec-steward` bin that `@kirill.konshin/lint` installs (`node_modules/.bin/spec-steward`); where the bin is absent, `node <this skill's folder>/scripts/steward.mjs`. Inside a Yarn script the bin resolves only once the installed release carries it (a yalc link adds `node_modules/.bin/spec-steward`, which Yarn's script PATH does not include); until then call it by path. It has no dependencies and needs Node ≥ 20 and git. Every command takes `--root NAME=path` (repeatable, for several repositories) and `--specs <dir>` (default `openspec/specs`).

## Pick the procedure

| The situation                                                   | Do                           |
| --------------------------------------------------------------- | ---------------------------- |
| You edited a spec, a proposal, or a test or code that cites one | [Check](#check)              |
| The spec gate, the edit hook or `steward check` reported one    | [Check](#check)              |
| Audit the corpus, a change, or a capability                     | [Audit](references/audit.md) |
| The owner has answered a review file                            | [Apply](references/apply.md) |
| A rule lives in several repositories                            | [Align](#align)              |
| Set up or repair the guard in a repository                      | [Wire](references/wiring.md) |

## Check

Where the repository's `AGENTS.md` names a spec gate in its Checks list, such as `yarn spec:gates`, run that gate: it runs `steward check --base auto` with the repository's `--binds`. Elsewhere run `steward check --base auto` yourself. It compares the working tree with the branch point and checks the corpus and the files citing it. Add `--file <path>` to scope it, `--json` for machines, `--strict` to fail on warnings, and `--fix` for the safe mechanical repairs. A kind marked _base only_ runs only when a base is set, and under a base the prompts cover only what the diff added or edited.

| Kind | Severity | What to do |
| --- | --- | --- |
| `dangling-citation` | error | Fix the path or anchor, or remove the citation. A citation is an optional pointer; the one rule is that it resolves. |
| `renamed-anchor` | error, base only | `--fix` rewrites every citation of an anchor the diff renamed. |
| `duplicate-anchor` | error | Two headings in one spec render the same slug. Rename one. |
| `duplicate-requirement` | error | One requirement name in two capabilities, or one body twice. Keep it in the capability that owns the behaviour and reference it from the other. |
| `size` | error past 500 words or 8 obligations, info past 300 or 5 | Split the requirement into coherent areas, never into one requirement per sentence ([model](references/model.md#tests-and-scenarios)). |
| `scenario-unproven` | error, base only | A scenario you added or edited in a REQUIRED requirement has no binding. Cite it where its test, type assertion, lint entry or check proves it ([binding](references/contract.md#binding)); a test you add must catch a regression of that case. If no evidence can, the requirement takes a Known gap naming the scenario, or becomes ⚠️ ADVISORY — the owner's call. |
| `weakened` | warn, base only | A rule was removed, lowered (MUST → SHOULD), lost an absolute, gained an exception or became advisory. **Stop and ask the owner** — unless they asked for exactly this. |
| `textual-test` | warn | The test asserts on source, spec or doc text. Prefer a behavioural test, or a deterministic tool for structure. |
| `marker-hygiene` | warn | `--fix` normalises a misspelt marker. A retired `**⚠️ Unenforced:**`, or a Known gap without a tracker, exempts nothing: replace it with Advisory, a tracked Known gap, or nothing, as the [model](references/model.md#advisory-known-gap-or-neither) says, and ask the owner, because each is a reclassification. |
| `new-requirement` | info, base only | Say, in your reply, which observable failure it prevents and what cheapest evidence catches it. If there is none, it is advisory or belongs elsewhere. |
| `absolute-unproven` | info | Name the absolute's exceptions, or confirm it has none. Advisory requirements are not reported. |
| `impl-detail`, `vague-obligation`, `restating-scenario`, `duplicate-scenario`, `unbound-test` | info | Prompts for judgement, not orders. Answer them in the spec or in your reply. Never write a test just to silence one. |
| `non-ears`, `non-bdd` | info, base only | Added or edited text only: write the statement in EARS and the scenario in Given/When/Then ([model](references/model.md#tests-and-scenarios)). Never fails. |

The exact rule behind each kind is in [contract.md](references/contract.md#kinds-and-severities). The edit hook runs the per-file checks on each file you touch, with no ratchet, and feeds them back at once. Treat its message as you would this table.

## Audit

Corpus-wide or affected-set, for corpus quality: placement, REQUIRED versus ⚠️ ADVISORY, evidence. The procedure, its parts and its verification are in [references/audit.md](references/audit.md). The output is a review file in the format of [references/review-format.md](references/review-format.md), and nothing in the specs or the code changes until the owner answers it.

Mechanical inputs:

- `steward check` (heuristic candidates)
- `steward evidence --out <dir>`: per-capability bundles, starting from the tests bound to each scenario
- `steward coverage --out <file>`: bindings, Advisory requirements and Known gaps per capability
- `steward partition --out <dir> --parts N`
- `steward index`: counts, and the citation inventory as bindings and pointers, with how many of them dangle

## Apply

The owner answers each item in the review file. [references/apply.md](references/apply.md) processes the answers round by round:

- apply ✅
- respect ❌
- investigate a bare comment
- re-audit what changed
- append new items

`steward review status` shows what is open.

## Align

`steward align --root A=<path> --root B=<path>` pairs the capabilities and requirements of several repositories and reports wording drift and one-sided rules. Choosing the wording is the owner's call. Once it is chosen, write it identically in every repository.
