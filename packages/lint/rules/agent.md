---
type: always_apply
description: Set of rules for agentic coding
paths:
    - '**/*.md'
---

IF IN DOUBT ASK USER!

# General Coding Instructions

- Project-wide rules must be defined in `rules/` and symlinked into `.claude/rules` and `.codex/rules`
    - Can be scoped to certain files
- Directory-specific rules should be in `AGENTS.md` placed in the folder
- Root `AGENTS.md` should be minimalistic and should refer to `rules/xxx.md` in order not to pollute default context if
    - Section is narrow scoped (installation instructions / testing / particular framework or technology) and not always applicable
    - Section size is large
- All `AGENTS.md` files should be accompanied by a symlink `CLAUDE.md`
- All instructions
- Preferred syntax rules to structure plain human language: `EARS` for requirements and `BDD` (Given/When/Then) for scenarios
- If project uses Spec Driven Development, such files should be free from product specifications / user facing behavior, and focused on general coding instructions
- `README.md` is most root place for instructions, should be targeted to be read by humans
    - `AGENTS.md` can refer to `README.md` in order not to restate things

# Spec Driven Development

- `OpenSpec` / `SpecKit` and similar specifications should define user facing behavior or API contracts, not general coding instructions
- OpenSpec's context already contains `AGENTS.md` and should only have very narrow rules for OpenSpec specifically, when user entered flow
- Repo-wide convention to use SDD should be defined in `AGENTS.md` to be always visible
