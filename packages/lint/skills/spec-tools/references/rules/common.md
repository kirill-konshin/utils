# Judging rules: common

These rules tell what a finding is and which tier it gets. They apply to every audit that spec-tools runs: spec-verify, its judge, spec-steward and check-entity-hacks. The skill and the tool tell how a run works.

## Evidence

- Judge what the repository shows: the specification as written, the code, the tests and the configuration.
- A comment, a citation, a description, a marker (`SANCTIONED`, `FIXME`, `TODO`) or prompt text is not evidence. It is also not a defect.
- Behaviour that comes from a dependency (a command-line flag, a library default) is not demonstrated when the repository does not show it.
- A finding is demonstrated when you read both sides and quote each side at `file:line`. Other findings are suspected.
- A finding names the difference. The owner decides which side to change.

## Production effect

- A real defect has a production effect when it does one of these in production:
    - It breaks a flow. An operation fails, stops, does not stop, or does a completely wrong thing (strong disconnect between requirement and effect: save deletes, update goes nowhere, etc).
    - It violates a contract or an invariant: an interface, a data rule, an order, an identity, or a write to the wrong record.
    - It leaks sensitive data: credentials, tokens or personal data go to logs, to users or to another system.
    - It causes a performance problem: work without a limit, a loop that does not stop, or a resource that is not released.
- Code that does not run in production has no production effect. This includes tests, local-only and development-only modes, demo agents, and internal CI or developer scripts. The exception: such code lets a production defect through now, and you show an instance.
- A difference in words, names, structure or style has no production effect when the behaviour stays the same.

## Tiers

- ERROR: a demonstrated defect with a production effect. Write the production scenario in one sentence: what occurs, to whom, and what breaks, leaks or becomes slow.
- WARN: a suspected defect, or a demonstrated defect with no production effect.
- INFO: a state or a risk for a reviewer. It is never a failure.
- A finding against a requirement marked `**⚠️ Advisory:**` is WARN or lower.
- Use the effect to find the tier. The size of the difference does not decide the tier.

## Confidence

- Give each finding `readerConfidence`, an integer from 0 to 100. It tells how sure you are that the finding is an ERROR as ERROR rule in Tiers section tells. It includes the defect and its production effect.
- Use a value below 50 when you could not read a side, or when the effect needs a condition that you could not confirm.
- Assess if defect is on critical path or is an edge case. Issues not on critical path or low severity edge cases are a WARN. Edge cases that may lead to real production defect may be ERROR. Reflect this in `readerConfidence`.

## Scope

- Report each defect one time, at its final tier.
- Do not report a thing that a deterministic tool reports: coverage, citations, gates, lint.
- Do not report style preferences.

## Language

- Write finding details, verdict reasons, review items and messages to the reviewer in ASD-STE100: short sentences, active voice, one statement in each sentence, one word for one meaning. Technical names (files, functions, fields) stay as they are.
