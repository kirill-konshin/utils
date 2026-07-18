---
name: verify-agent-rules
description: Audit this repo's code against the coding rules shipped by @kirill.konshin/agents. Rules are discovered from .claude/rules/*.md (created by `agents init`), falling back to node_modules/@kirill.konshin/agents/rules/*.md where init hasn't run; project agent-instruction files (AGENTS.md Custom Rules, CLAUDE.md, etc.) are read on top and override the packaged rules on conflict. Reports violations with file/line, a summary, and a criticality verdict, then interactively lets the user decide how to resolve each one. Use when asked to check, audit, verify, or lint the codebase against agent rules/conventions, or to find rule violations.
---

# Verify Agent Rules

## Rules to check against

Locate the rule files by checking these locations in order and using the first that exists:

1. `.claude/rules/*.md` — present after `agents init`: consumers run it via `npx`, and the utils monorepo itself runs it from the root `prepare` script (symlinked there and auto-loaded by Claude Code; the generated `AGENTS.md` also references them via `@include` lines for Codex and other tools).
2. `node_modules/@kirill.konshin/agents/rules/*.md` — a consumer project where `agents init` hasn't been run yet.

Treat every rule file found as normative — read them directly rather than relying on this skill to restate them.

## Project overrides

The packaged rules are defaults, not absolutes. Before auditing, also scan every default agent-instruction location that exists in the repo and treat its content as rules ON TOP of the packaged ones:

- `AGENTS.md` — everything below the `# Custom Rules` heading (the generated section above it just `@include`s the packaged rules already discovered); nested `AGENTS.md` files in subdirectories apply to their subtree
- `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`, nested `CLAUDE.md` files — skip any that are symlinks to `AGENTS.md` (that's how `agents init` wires them up)
- Other agent memory files if present: `.cursor/rules/*` / `.cursorrules`, `.github/copilot-instructions.md`, `GEMINI.md`

On conflict, the project file wins over the packaged rule. E.g. the packaged `tailwind.md` names Hero UI as the default UI library — but if the project's Custom Rules say Bootstrap, then Bootstrap usage is compliant and must not be reported; flag Hero UI usage instead if the override forbids it. Fold all overrides into the rule set before Step 1, and when an override changed a verdict, attribute the finding to the overriding file, not the packaged rule.

## Step 1: Audit

Scan the repository (or the subset the user pointed at) for violations of any rule. Enumerate every violation found, most critical first, each with:

1. **Rule** — which rule file (and section, if named) is being violated.
2. **Location** — `path/to/file:line` where the offending code is defined.
3. **Violation summary** — one or two sentences on what's wrong and why it breaks the rule.
4. **Criticality verdict** — e.g. Critical / High / Medium / Low, based on real-world impact (breaks builds or tests > correctness or security > consistency > nitpick).

If nothing is found, say so plainly and stop here — don't proceed to Step 2.

## Step 2: Ask how to proceed

After presenting the full list, ask the user to pick exactly one:

- **Go one by one** — walk through each issue individually (Step 3).
- **Reply with instructions** — the user gives free-form instructions covering some or all issues in a single message; apply them as given.
- **Skip all** — take no action; the audit stands as a report only.
- **Fix all** — fix every violation directly, without further per-issue confirmation.

Follow exactly what the user picks. Don't fix anything before this choice is made.

## Step 3: One-by-one mode

Only when the user chose "go one by one": go through each violation in the listed order and, for each, ask the user to pick exactly one:

- **Skip** — leave this one alone, move to the next.
- **Skip & add override** — leave the code alone AND append a project override to the `# Custom Rules` section of `AGENTS.md` (create the file via `agents init` if missing) so future audits treat this as compliant. Draft the override as a general rule stating the project's choice (e.g. "Use Bootstrap instead of Hero UI"), not a per-file exception — unless the violation is genuinely a one-off, then scope it narrowly (e.g. "`legacy/` is exempt from the TypeScript rule"). Show the drafted line before writing it.
- **Fix** — apply the fix directly.
- **Type instructions** — the user provides specific instructions for this issue; apply them.

## Step 4: Report the diff

Once any change has been made under any of the modes above, show the diff of everything that changed.
