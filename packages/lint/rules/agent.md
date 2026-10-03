---
type: always_apply
description: Set of rules for agentic coding
paths:
    - '**/*.md'
---

IF IN DOUBT ASK USER!

# What Goes Where

Use this summarized guidance to consider where to place a set of instructions

- `README.md` — human-readable instructions how to work with repo
- Root `AGENTS.md` — default context for agents, always included
- Subdirectory `AGENTS.md` — scoped to this particular directory, auto-injected
- `.claude/rules` — forced rules, that agent will read based on frontmatter, potentially with a paths scope, may pollute context if not scoped well, should NOT have detailed guidance, examples, etc.
- `rules/` referred from `AGENTS.md` — simple decomposition to clear up default context from specific / scoped / rarely used instructions, no frontmatter
- `.claude/skills` or `.codex/skills` — one-off flows, potentially complex; but also sets of rules that agent may or may not read/follow, good for progressive disclosure, examples, thorough guidance, and has to be well-defined in frontmatter to increase likelihood of success, example: https://www.skills.sh/vercel-labs/agent-skills/vercel-react-best-practices
- `.claude/commands` — one-off commands, usually simpler than skills
- `openspec/specs` - SDD specifications, should define user facing behavior or API contracts, not coding instructions / best practices / etc.
- `openspec/config.yml#context` - should only have very narrow rules for OpenSpec specifically, when user entered flow
- `openspec/config.yml#rules.[specs|proposal]` - very narrow sets of rules specifically for defined part of the flow when it's entered
- `openspec/config.yml#operation.[apply|archive].guidance` - very narrow sets of rules specifically for defined part of the flow when it's entered

# `README.md`

- Should be targeted to be read by humans
- First file that's visible to humans

# `.claude/rules` and `.codex/rules`

- Can itself be a link to rules from a package; or individual files inside can be symlinks
- Must be accompanied by symlink `.codex/rules`
- Files should be scoped to certain paths
- Files should be small,
- Examples not allwed in general
- Should describe only conding conventions & recommendations
    - As bullet points
    - Concise, terse and to the point

# `AGENTS.md`

- Root `AGENTS.md`
    - Should be minimalistic and should refer to `rules/xxx.md` in order not to pollute default context if
    - Can be decomposed as references to files in `rules/` folder also located at repo root
        - Files in `rules/` should be referred conditionally, e.g. with minimal explanation what's inside so agent has better chances of reaching them
        - Frontmatter not supported
        - Decomposition should be used when
            - Section is narrowly scoped (installation instructions / testing / particular framework or technology) and not always applicable
            - Section is large
- Directory-specific rules should be in `AGENTS.md` of that folder
- All `AGENTS.md` files should be accompanied by a symlink `CLAUDE.md`
- `AGENTS.md` can refer to `README.md` in order not to restate things
- Repo-wide convention to use SDD should be defined in `AGENTS.md` to be always visible

# `.claude/skills` and `.codex/skills`

- May define either
    - A workflow
    - A process
    - A set of rules
    - Best practices
    - Examples
- Agent decides to discover it or not, use it or not, so no guarantee of honoring

# `.claude/commands`

- Smaller and simpler than skills
- One-off commands, not flows

# `openspec`

- `OpenSpec` / `SpecKit` and similar specifications should define user facing behavior or API contracts, not general coding instructions
- Openspec-specific instructions must assume that flow WAS ENTERED, thus `AGENTS.md` or `[.claude|.codex]/skills` must be used to define how to enter the flow, and how flow should look like from outside perspective (without details)
- `openspec/config.yml#context` - should only have very narrow rules for OpenSpec specifically, when user entered flow
    - Context will already contain root `AGENTS.md`, no duplication needed
- `openspec/config.yml#rules.[specs|proposal]` - very narrow sets of rules specifically for defined part of the flow when it's entered
- `openspec/config.yml#operation.[apply|archive].guidance` - very narrow sets of rules specifically for defined part of the flow when it's entered

# Common rules for `.claude/rules`, `.codex/rules`, `AGENTS.md` and `rules/`

- Preferred syntax rules to structure plain human language: `EARS` for requirements and `BDD` (Given/When/Then) for scenarios
- If project uses Spec Driven Development, these files should be free from product specifications / user facing behavior, and only focused on general coding instructions

# Spec Driven Development in general

- Preferred syntax rules to structure plain human language: `EARS` for requirements and `BDD` (Given/When/Then) for scenarios
