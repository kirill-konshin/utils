# Judging rules: common

These rules tell what a finding is, how severe it is, and how sure you are of it. They apply to every audit that spec-tools runs: spec-verify, its judge, spec-steward and check-entity-hacks. The skill and the tool tell how a run works.

## Evidence

- Judge what the repository shows: the specification as written, the code, the tests and the configuration.
- A comment, a citation, a description, a marker (`SANCTIONED`, `FIXME`, `TODO`) or prompt text is not evidence. It is also not a defect.
- Behaviour that comes from a dependency (a command-line flag, a library default) is not demonstrated when the repository does not show it.
- Installed dependency code (`node_modules/`) is not the repository. Do not judge it, and do not use it as evidence. A defect in a dependency is for that dependency's own tests, not for this audit.
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

## Severity

- Give each finding a severity, an integer from 0 to 100, on this scale:

| Band | Severity | The finding is |
| --- | --- | --- |
| ERROR | 90–100 | data loss, a leak of sensitive data, a security hole, or a main flow that fails in production |
| ERROR | 70–89 | a demonstrated defect with a production effect: a flow fails, a contract or an invariant is broken, or users or operators see a performance problem |
| WARN | 40–69 | a suspected defect; a demonstrated defect with no production effect; a conflict between rules |
| INFO | 1–39 | a state or a risk for a reviewer: a duplicate rule, a test that asserts less than its scenario, a wording problem. It is never a failure. |
| — | 0 | not true |

- For a severity in the ERROR band, write the production scenario in one sentence: what occurs, to whom, and what breaks, leaks or becomes slow.
- The tool turns severity and confidence into ERROR, WARN or INFO with its thresholds. The bands above are its defaults; a run can move them. Give the severity that the finding has. Do not aim at a band.
- A finding against a requirement marked `**⚠️ Advisory:**` is in the WARN band or lower.
- Use the effect to find the severity. The size of the difference does not decide the severity.
- Find if the defect is on a critical path or is an edge case. A defect that is not on a critical path, or an edge case with a small effect, is in the WARN band. An edge case that can cause a real production defect can be in the ERROR band.

## Confidence

- Give each finding a confidence, an integer from 0 to 100. It tells how sure you are that the defect exists as you write it, and that its severity is correct.
- Use a value below 50 when you could not read a side, or when the effect needs a condition that you could not confirm.
- Put your doubt in the confidence, not in the severity. An unsure ERROR has an ERROR-band severity and a low confidence.

## Scope

- Report each defect one time, at its final severity.
- Do not report a thing that a deterministic tool reports: coverage, citations, gates, lint.
- Do not report style preferences.

## Language

- Write finding details, verdict reasons, review items and messages to the reviewer in ASD-STE100: short sentences, active voice, one statement in each sentence, one word for one meaning. Technical names (files, functions, fields) stay as they are.
