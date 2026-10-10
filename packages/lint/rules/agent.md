---
type: always_apply
description: Set of rules for agentic coding
# paths:  # removed so ALL agents read it where to find information
#    - '**/*.md'
#    - 'openspec/config.yml'
---

IF IN DOUBT ASK USER!

# What Goes Where

Use this summarized guidance to consider where to place a set of instructions

- `README.md` — human-readable instructions how to work with repo
- Root `AGENTS.md` — default context for agents, always included
- Subdirectory `AGENTS.md` — scoped to this particular directory, auto-injected
- `.agents/rules` — forced rules (or automatic guardrails), that agent will read based on frontmatter, with paths scope; may pollute context if not scoped well; should NOT have detailed guidance, examples, etc.
- `.agents/skills` — one-off flows, potentially complex; but also sets of rules & instructions that agent may or may not read/follow, good for progressive disclosure, examples, thorough guidance, and something you want to offload from `AGENTS.md` (and cite from it), and has to be well-defined in frontmatter to increase likelihood of success, example: https://www.skills.sh/vercel-labs/agent-skills/vercel-react-best-practices
- `.agents/commands` — one-off commands, usually simpler than skills
- `openspec/specs` - SDD specifications, should define user facing behavior or API contracts, not coding instructions / best practices / etc.
- `openspec/config.yml#context` - should only have very narrow instructions for OpenSpec specifically, when user entered flow
- `openspec/config.yml#rules.[specs|proposal]` - very narrow sets of rules specifically for defined part of the flow when it's entered
- `openspec/config.yml#operation.[apply|archive].guidance` - very narrow sets of rules specifically for defined part of the flow when it's entered

# Placement Decision

When deciding where information belongs, use this order:

1. Is it durable observable system/component behavior?
    - **→ `openspec/specs`**
2. Must the agent always know it when touching a deterministically identifiable set of files?
    - **→ scoped `.agents/rules`**
3. Is it mandatory repo-wide or directory-wide context/routing?
    - **→ `AGENTS.md`**
4. Is it detailed knowledge, guidance, examples, best practices, or a reusable procedure that should be progressively disclosed?
    - **→ skill**
5. Is it merely supporting material extracted from `AGENTS.md` to reduce default context?
    - **→ skill**, referenced explicitly from `AGENTS.md`
6. Is it primarily documentation for humans?
    - **→ `README.md`**

When correctness depends on an instruction being observed, do NOT rely solely on skill discovery.

Prefer one authoritative location for each concern. Reference it elsewhere instead of duplicating it.

# `README.md`

- Should be targeted to be read by humans
- First file that's visible to humans

# `AGENTS.md`

- Root `AGENTS.md`
    - Should be minimalistic
    - Can be decomposed as `skills` & `rules` (with references to them)
        - Such references to skills should be referred conditional, e.g. with minimal explanation when to use so agent has better chances of reaching them
        - Decomposition should be used when
            - Section is narrowly scoped (installation instructions / testing / particular framework or technology) and not always applicable
            - Section is large
    - `AGENTS.md` can refer to `README.md` in order not to restate things
    - Repo-wide convention to use SDD should be defined here to be always visible
    - Focus on mandatory routing and instructions
- Sub-directory `AGENTS.md`
    - Directory-specific rules & instructions should be in `AGENTS.md` of that folder
    - Lift rules & instructions up the tree to higher `AGENTS.md` if multiple dirs must adhere to them, don't copy-paste them
- All `AGENTS.md` files should be accompanied by a symlink `CLAUDE.md`

# `.agents/rules`

- `.agents/rules` must be accompanied by symlinks in `.claude/rules`
- Files should be scoped to certain paths
- Files should be small,
- Examples not allowed in general
- Should describe only coding conventions, recommendations, forced contextual instructions / automatic guardrails
    - As bullet points
    - Concise, terse and to the point
    - Hard constraints
    - That must appear in scope by `paths` glob
- Should be cited in `AGENTS.md` to ensure they're discoverable by harnesses that don't support `.xxx/rules` natively
- A `paths`-scoped rule loads only when the harness opens a matching file: before editing a file through a shell command, or in a repository other than the session's, read the rules whose `paths` match it
- Never judge configuration unused before reading the rule that names it

# `.agents/skills`

- `.agents/skills` must be accompanied by symlinks in `.claude/skills`
- May define either
    - A workflow
    - A process
    - A set of rules
    - Best practices
    - Examples
    - Engineering knowledge
- Agent decides to discover it or not, use it or not, so no guarantee of honoring
- A requirement/rule MUST NOT exist only in a skill if correctness depends on the agent always observing it

# `.agents/commands`

- `.agents/commands` must be accompanied by symlinks in `.claude/commands`
- Smaller and simpler than skills
- One-off commands, not flows

# `openspec`

- `OpenSpec` / `SpecKit` and similar SDD specifications should define
    - User facing or externally observable behavior
    - Durable component/system/API contracts & invariants
    - Not general coding instructions
- Openspec-specific instructions must assume that flow WAS ENTERED, thus `AGENTS.md` or `[.agents|.claude]/skills` must be used to define how to enter the flow, and how flow should look like from outside perspective (without details)
- `openspec/config.yml#context` - should only have very narrow instructions for OpenSpec specifically, when user entered flow
    - Context will already contain root `AGENTS.md`, no duplication needed
- `openspec/config.yml#rules.[specs|proposal]` - very narrow sets of rules specifically for defined part of the flow when it's entered
- `openspec/config.yml#operation.[apply|archive].guidance` - very narrow sets of instructions specifically for defined part of the flow when it's entered
- The two litmus questions:
    - Could the implementation be rewritten substantially and the statement still hold? Then it is SPEC.
    - Could the detail change while the contract stays the same? Then it is not SPEC.
- Requirements and scenarios should (preferrably) be proven by tests, and may be cited in tests for stronger connection
    - Tests should be validated that they do what spec says (optional, unless project mandates this in root `AGENTS.md`)
- Code citations must resolve, not checked for validity
- Comments, descriptions, prompt or documentation text, and citations are not evidence that code complies, and their absence or wording is never a violation

# Common for `AGENTS.md` `.agents/rules` `.agents/skills`

- If project uses Spec Driven Development framework like OpenSpec, these files should be free from product specifications / external behavior, and only focused on general coding instructions
- Preferred instructions/rules syntax how to structure plain human language: `EARS` for requirements and `BDD` (Given/When/Then) for scenarios
- Rules & instructions in these files can't be cited from tests or code, so their proof is tooling, never a citation
