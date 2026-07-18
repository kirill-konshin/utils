---
name: verify-agent-rules
description: Audit this repo's code against the coding rules shipped by @kirill.konshin/agents. Rules are discovered from .claude/rules/*.md (created by `agents init`), falling back to node_modules/@kirill.konshin/agents/rules/*.md where init hasn't run. Reports violations with file/line, a summary, and a criticality verdict, then interactively lets the user decide how to resolve each one. Use when asked to check, audit, verify, or lint the codebase against agent rules/conventions, or to find rule violations.
---

# Verify Agent Rules

## Rules to check against

Locate the rule files by checking these locations in order and using the first that exists:

1. `.claude/rules/*.md` — present after `agents init`: consumers run it via `npx`, and the utils monorepo itself runs it from the root `prepare` script (symlinked there and auto-loaded by Claude Code; the generated `AGENTS.md` also references them via `@include` lines for Codex and other tools).
2. `node_modules/@kirill.konshin/agents/rules/*.md` — a consumer project where `agents init` hasn't been run yet.

Treat every rule file found as normative — read them directly rather than relying on this skill to restate them.

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
- **Fix** — apply the fix directly.
- **Type instructions** — the user provides specific instructions for this issue; apply them.

## Step 4: Report the diff

Once any change has been made under any of the modes above, show the diff of everything that changed.
