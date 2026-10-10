---
name: Spec author
description: Write or edit a capability specification in openspec/specs — the default direct-edit path
allowed-tools: Bash(openspec:*), Bash(spec-tools:*), Bash(spec-steward:*), Bash(yarn openspec:*), Bash(yarn spec-tools:*), Bash(yarn spec-steward:*), Bash(npx openspec:*), Bash(npx spec-tools:*), Bash(npx spec-steward:*), Bash(git diff*), Bash(git log*), Read, Edit, Write, Glob, Grep
---

Write or edit a capability specification in place. This is the **default** path for specification work; the `/opsx:*` commands drive the full delta flow and run only when the user asks for them.

How a specification is written is the spec-steward model, [`references/model.md`](../skills/spec-steward/references/model.md), and what the gate checks is its [`references/contract.md`](../skills/spec-steward/references/contract.md); the rest of the tooling's contract is the spec-tools skill's [`references/contract.md`](../skills/spec-tools/references/contract.md); the change paths and who commits are in the root `AGENTS.md`. Read them; this file only sequences the work.

## Steps

1. **Ask about scope first.** A workspace or branch, or the current tree? A direct edit, or a change folder because the work needs a written plan? Wait for an answer unless the user already gave one. The full delta flow is never yours to choose: take it only when the user names it.

2. **Find the capability.** `openspec list --specs`. Edit the existing `openspec/specs/<capability>/spec.md` that owns the behaviour; a new capability is a decision to raise out loud. A pattern that works system-wide earns its own folder.

3. **Read the neighbours.** A rule lives in the capability that owns it — cite a neighbour rather than restating it. If the new behaviour contradicts an existing requirement, surface it and let the user decide; do not paper over it in either place.

4. **If the user chose a change folder**: `openspec new change <name>`, set `skip_specs: true` in its `.openspec.yaml`, write `proposal.md`, `design.md` and `tasks.md`. The behaviour still lands as a direct edit — the folder carries the plan, never deltas. Set `skip_specs` yourself when the change is plainly simple (a bugfix, a small feature); ask when in doubt. The folder is archived inside the merge or pull request, on the user's word.

5. **Write it.** Name the observable failure the rule prevents and the cheapest evidence that catches it; if there is none, mark the requirement `**⚠️ Advisory:** <why review is its evidence>`, and record what is knowingly missing as `**⚠️ Known gap (<tracker>):** <what is missing>`. Write a new or edited statement in EARS (`When <trigger>, the <system> SHALL <response>`, `While <state>, …`, `If <condition>, then …`, or `The <system> SHALL …`), keeping the RFC 2119 keyword in capitals, and each new or edited scenario in Given/When/Then, one case each, Given only where a precondition matters; leave untouched text as it is. Write new and edited text in the model's light ASD-STE100 subset: one obligation per sentence, at most 25 words per sentence, one term for one concept, active voice, no vague word in a REQUIRED statement. Scenario names are unique within the file:

    ```markdown
    ### Requirement: <name>

    When <trigger>, the <system> SHALL <response>.

    #### Scenario: <name>

    - **GIVEN** <precondition, only where it matters>
    - **WHEN** <trigger>
    - **THEN** <observable outcome>
    ```

    A test that proves a scenario cites its anchor on its `describe`/`it`/`test` block; a code citation is optional and only has to resolve (the spec-steward contract).

6. **Verify**: run the checks the root `AGENTS.md` lists; where it lists none, `openspec validate --strict --all` and `spec-tools gates`.

7. **Hand back.** Say what changed, in ASD-STE100, and show the `spec-tools diff` first line. Do not commit, push, or archive; end with the decisions the user has to make.
