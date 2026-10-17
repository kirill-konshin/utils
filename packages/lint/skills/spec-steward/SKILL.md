---
name: spec-steward
description: Guard, audit and repair an OpenSpec specification corpus — whether these are the right rules, in the right place, with the right evidence; it proposes spec changes and never fails a build. Use when auditing specs for corpus quality (the whole corpus, a change, or one capability), producing or processing a spec review file (the YAML review `.spec-audit/spec-review.yaml`, where the owner answers each item's `decision` with ✅ / ❌ / a comment), aligning rules shared by several repositories, wiring the spec guard (edit hook, AGENTS.md routing, OPSX config) into a repository, or when the repository's spec gate, `spec-tools steward check` or the edit hook reports a finding. Deterministic scripts do the mechanical work; the skill supplies the procedure. It does not audit code conformance; the `spec-verify` skill does. Writing a rule is the `/spec-author` command.
---

# Spec steward

Procedures for an OpenSpec corpus. Five things live elsewhere and are not repeated here:

- the hard constraints for editing specs — the scoped rule `.agents/rules/openspec.md`
- where any guidance belongs — `.agents/rules/agent.md`
- the specification model (REQUIRED versus ⚠️ ADVISORY, Known gaps, the evidence ladder, what is not evidence, how requirements and scenarios are written) — [references/model.md](references/model.md)
- what the gate checks and emits (citations, binding, markers, size lines, the scenario ratchet, base resolution, exit codes, the coverage report, the evidence data) — [references/contract.md](references/contract.md)
- what the audit judges and how sure a finding must be — the judging rules, [`common.md`](../spec-tools/references/rules/common.md) and [`spec-steward.md`](../spec-tools/references/rules/spec-steward.md)

`steward` below means `spec-tools steward`, through the `spec-tools` bin `@kirill.konshin/lint` installs; where the bin is absent, `node <the spec-tools skill's folder>/scripts/cli.js steward`. The file is self-contained and needs Node ≥ 20 and git. Every command takes `--root NAME=path` (repeatable, for several repositories) and `--specs <dir>` (default `openspec/specs`).

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

Where the repository's `AGENTS.md` names a spec gate in its Checks list, such as `spec-tools gates`, run that gate: it runs `steward check --base auto` with the repository's binds. Elsewhere run `steward check --base auto` yourself. It compares the working tree with the branch point and checks the corpus and the files citing it. Add `--file <path>` to scope it, `--json` for machines, `--strict` to fail on warnings, and `--fix` for the safe mechanical repairs. A kind marked _base only_ runs only when a base is set, and under a base the prompts cover only what the diff added or edited.

<table>
  <thead>
    <tr><th>Kind</th><th>Severity</th><th>What to do</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><code>dangling-citation</code></td>
      <td>error</td>
      <td>Fix the path or anchor, or remove the citation. A citation is an optional pointer; the one rule is that it resolves.</td>
    </tr>
    <tr>
      <td><code>renamed-anchor</code></td>
      <td>error, base only</td>
      <td><code>--fix</code> rewrites every citation of an anchor the diff renamed.</td>
    </tr>
    <tr>
      <td><code>duplicate-anchor</code></td>
      <td>error</td>
      <td>Two headings in one spec render the same slug. Rename one.</td>
    </tr>
    <tr>
      <td><code>duplicate-requirement</code></td>
      <td>error</td>
      <td>One requirement name in two capabilities, or one body twice. Keep it in the capability that owns the behaviour and reference it from the other.</td>
    </tr>
    <tr>
      <td><code>size</code></td>
      <td>error past 500 words or 8 obligations, info past 300 or 5</td>
      <td>Split the requirement into coherent areas, never into one requirement per sentence (<a href="references/model.md#tests-and-scenarios">model</a>).</td>
    </tr>
    <tr>
      <td><code>scenario-unproven</code></td>
      <td>error, base only</td>
      <td>A scenario you added or edited in a REQUIRED requirement has no binding. Cite it where its test, type assertion, lint entry or check proves it (<a href="references/contract.md#binding">binding</a>); a test you add must catch a regression of that case. If no evidence can, the requirement takes a Known gap naming the scenario, or becomes ⚠️ ADVISORY — the owner's call.</td>
    </tr>
    <tr>
      <td><code>weakened</code></td>
      <td>warn, base only</td>
      <td>A rule was removed, lowered (MUST → SHOULD), lost an absolute, gained an exception or became advisory. <strong>Stop and ask the owner</strong> — unless they asked for exactly this. In a hand-back, map each finding to the decision that authorised it (a review item, a ticket, the owner's word) and list only the unmatched ones for a decision; a verbatim move is already reported as a rename.</td>
    </tr>
    <tr>
      <td><code>textual-test</code></td>
      <td>warn</td>
      <td>The test asserts on source, spec or doc text. Prefer a behavioural test, or a deterministic tool for structure.</td>
    </tr>
    <tr>
      <td><code>marker-hygiene</code></td>
      <td>warn</td>
      <td><code>--fix</code> normalises a misspelt marker. A retired <code>**⚠️ Unenforced:**</code>, or a Known gap without a tracker, exempts nothing: replace it with Advisory, a tracked Known gap, or nothing, as the <a href="references/model.md#advisory-known-gap-or-neither">model</a> says, and ask the owner, because each is a reclassification.</td>
    </tr>
    <tr>
      <td><code>new-requirement</code></td>
      <td>info, base only</td>
      <td>Say, in your reply, which observable failure it prevents and what cheapest evidence catches it. If there is none, it is advisory or belongs elsewhere.</td>
    </tr>
    <tr>
      <td><code>absolute-unproven</code></td>
      <td>info</td>
      <td>Name the absolute's exceptions, or confirm it has none. Advisory requirements are not reported.</td>
    </tr>
    <tr>
      <td><code>impl-detail</code>, <code>vague-obligation</code>, <code>restating-scenario</code>, <code>duplicate-scenario</code>, <code>unbound-test</code></td>
      <td>info</td>
      <td>Prompts for judgement, not orders. Answer them in the spec or in your reply. Never write a test just to silence one.</td>
    </tr>
    <tr>
      <td><code>non-ears</code>, <code>non-bdd</code></td>
      <td>info, base only</td>
      <td>Added or edited text only: write the statement in EARS and the scenario in Given/When/Then (<a href="references/model.md#tests-and-scenarios">model</a>). Never fails.</td>
    </tr>
  </tbody>
</table>

The exact rule behind each kind is in [contract.md](references/contract.md#kinds-and-severities). The edit hook runs the per-file checks on each file you touch, with no ratchet, and feeds them back at once. Treat its message as you would this table.

## Audit

Local only, on the owner's request — CI runs this skill's `check` (inside `spec-tools gates`), `coverage` and `evidence`, never the audit. Corpus-wide or affected-set, for corpus quality: placement, REQUIRED versus ⚠️ ADVISORY, evidence. It runs on the engine `spec-verify` runs on — `spec-tools audit --audit spec-steward` — with this skill's [worker contract](references/worker.md) and [sweeps](sweeps.json). Pass the owner's earlier decisions with `--context <file>`. The procedure around it is [references/audit.md](references/audit.md). The output is the YAML review file `.spec-audit/spec-review.yaml`, in the format of [references/review-format.md](references/review-format.md). Nothing in the specs or the code changes until the owner answers it.

## Apply

The owner answers each item in the review file, in its `decision`. [references/apply.md](references/apply.md) processes the answers round by round:

- apply ✅
- respect ❌
- examine a comment again
- audit again what changed
- add new items

`steward review status <review.yaml>` shows what is open.

## Language

Write review items, finding details, verdict reasons and messages to the owner in ASD-STE100 ([common rules](../spec-tools/references/rules/common.md#language)).

## Align

`steward align --root A=<path> --root B=<path>` pairs the capabilities and requirements of several repositories and reports wording drift and one-sided rules. Choosing the wording is the owner's call. Once it is chosen, write it identically in every repository.
