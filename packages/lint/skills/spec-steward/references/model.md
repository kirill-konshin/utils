# The specification model

Where a piece of guidance lives is decided by `rules/agent.md`, shipped by `@kirill.konshin/lint`; in a repository it is `.agents/rules/agent.md`. Read it there; this file covers only what is specific to the specifications themselves. What the gate checks mechanically — citations, binding, markers, size lines, the scenario ratchet — is [contract.md](contract.md).

## A rule in `openspec/specs` is a contract

A requirement states durable, observable behaviour of the system or of a component: inputs and validation, outputs, error semantics, lifecycle, state transitions, ordering, compatibility, persistence, concurrency, interactions between components. Internal package and API contracts qualify as much as user-facing behaviour — the line is **contract versus implementation or process**, never product versus engineering.

Normative force is carried by the RFC 2119 keywords — MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, MAY, OPTIONAL — written in capitals and read as RFC 2119 defines them; emphasis or capitalisation of any other word carries no force, and a keyword inside backticks is mentioned, not issued.

A specification describes only real, existing behaviour. What is knowingly absent or incomplete is recorded as a [Known gap](#advisory-known-gap-or-neither), never written as though implemented and never left as unmarked silence.

Apply the two litmus questions from `rules/agent.md`; then the decision test:

> **Name the observable failure this rule prevents, and the cheapest evidence that would catch it.**

If you cannot name a failure, the rule is not a REQUIRED contract.

## Two kinds of requirement

| Kind | Meaning | Evidence |
| --- | --- | --- |
| **REQUIRED** | An invariant whose violation is a real defect — behavioural, API, compatibility, security, data. | The cheapest rung that catches the failure (ladder below). The requirement names that failure and that rung; a test is one rung, not the only one. |
| **⚠️ ADVISORY** | Design guidance that matters but cannot reasonably be proven mechanically. | Review judgement. Never a gate, never a reason to write a test. |

A REQUIRED requirement stating an absolute names its exceptions, or has none; one with neither is listed for the owner's review.

## Advisory, Known gap, or neither

A requirement is REQUIRED unless a marker says otherwise. The exact spellings, and what each exempts, are in [contract.md](contract.md#markers).

- **⚠️ Advisory** — permanent guidance whose only evidence is review, such as a design direction. Its line says why review is its evidence, and its RFC 2119 keywords stay. The marker qualifies the whole requirement, so a requirement that mixes a contract with guidance is split, and the contract half stays REQUIRED. Marking an existing requirement Advisory weakens it, so the owner confirms it.
- **⚠️ Known gap (<tracker>)** — behaviour the requirement describes is knowingly absent or incomplete, or a REQUIRED rule lacks the evidence that would catch its failure. The line says what is missing (for missing evidence, the missing rung) and names what tracks it: a ticket, a tickets-page entry or an open change. Under the requirement, it names by title the scenarios it exempts; inside a scenario's block, it exempts that scenario. A gap is never restated as a scenario, and a scenario that a gap conditions states that condition.
- **Neither** — a test (an end-to-end test included), a type assertion, a lint entry or a deterministic check that CI runs proves the rule. It stays REQUIRED and unmarked.

## The evidence ladder — cheapest first

1. The type system or compiler
2. Deterministic static analysis — lint, dependency rules, schema validation, a simple script
3. A behavioural test of the contract
4. A focused integration or end-to-end test
5. Implementation evidence a reader can point at
6. Review judgement, for a genuinely semantic concern

Prefer the cheapest rung that catches the failure. Never spend an LLM audit on what rungs 1–2 can prove. A requirement that constrains a shape, an interface or a structure rather than runtime behaviour is proven at rung 1 or 2 — a compile-time type assertion, a schema assertion, a lint entry or a deterministic script — as fully as a runtime test would prove it. Rungs 1–4 bind a scenario through a citation ([contract.md](contract.md#binding)); rungs 5 and 6 cannot. A REQUIRED rule that only they evidence therefore takes a Known gap naming the missing rung once one of its scenarios is added or changed.

## What is not evidence

- **Comments, descriptions, prompt or documentation text, and citations.** They are not evidence that code complies, and their absence or wording is never a violation. A citation in code is an optional pointer for a reader; the only rule on it is that it resolves.
- **A test that reads source, spec or documentation text** and asserts on it proves the text is present, not that the system behaves. If the structure itself is the contract (a dependency boundary, a manifest field), a deterministic tool usually proves it better than a test.
- **Coverage.** A test written so that spec prose counts as "covered" is compliance theatre. A test exists because it catches a meaningful regression.

## Citations

A code citation is written only where a reader needs the pointer: on the declaration whose behaviour it explains, never on a file's header, whose scope is everything and therefore nothing. Write it `{@link openspec/specs/<capability>/spec.md#<anchor>}`, addressed from the repository root, inside the declaration's `/** */` block, or as a `//` comment where JSDoc cannot attach. The gate checks only that it resolves.

## Tests and scenarios

A spec-driven test names the scenario it proves (`{@link openspec/specs/<capability>/spec.md#scenario-<slug>}`), so the binding between contract and evidence is explicit. The citation goes in the comment directly above the `describe`/`it`/`test` call, or inside it. A citation in a test file's header binds nothing ([contract.md](contract.md#binding)). A requirement with a single scenario may be cited by its requirement anchor.

A requirement describes one coherent area of behaviour a reader can hold in their head; related cases group under it as scenarios, one case each. Several rules that govern the same area form one requirement, and its scenarios carry the individual cases. A scenario exercises one specific case, not a family of them. A requirement past a size line ([contract.md](contract.md#size-gate-with-obligation-counting)) is split into coherent areas, never into one requirement per sentence.

A scenario adds precision — one concrete case, preferably Given/When/Then — or it is not written; a scenario that restates its requirement is noise. A requirement may carry a single scenario. That is not a smell, and no case is padded in to avoid it; OpenSpec's strict validation needs at least one.

New and edited text uses EARS for requirement statements — When <trigger>, the <system> SHALL <response>; While <state>, the <system> SHALL …; If <condition>, then the <system> SHALL …; or The <system> SHALL … — and Given/When/Then for scenarios, with Given only where a precondition matters. The RFC 2119 keyword stays in capitals: OpenSpec's strict validation fails a requirement whose body has no SHALL or MUST. Untouched text is not rewritten for syntax alone.

## Changing a rule

- Never weaken, narrow, delete or reclassify a rule to make code pass. A demonstrated divergence is decided by the owner: the code is wrong, or the rule is — and a wrong rule is changed openly, through the repository's change process.
- A rule shared by several repositories is worded identically in each.
- A rule restated in two places is one rule too many: keep it in the owning place and reference it elsewhere.
