---
name: lint-repo
description: Set up/update this repo's ESLint + Prettier + lint-staged + Husky tooling (@kirill.konshin/lint), and/or audit the codebase against the packaged agent rules. Rules are discovered from .claude/rules/*.md (created by `lint-prepare init`), falling back to node_modules/@kirill.konshin/lint/rules/*.md; project overrides in AGENTS.md Custom Rules / CLAUDE.md win on conflict. Use when asked to set up, configure, or upgrade lint/format/pre-commit tooling, OR to check, audit, verify, or lint the codebase against agent rules/conventions.
---

# Lint Repo

Two jobs. Pick by the request; do only what was asked.

- **Set up / upgrade lint tooling** → [§A](#a-set-up--update-tooling)
- **Audit code against the rules** → [§B](#b-audit-code-against-rules)

Full config templates: @README.md

## A. Set up / update tooling

Follow the README, reconciling (never blindly overwriting project-specific overrides):

1. **Install** — add `eslint`, `prettier`, `@kirill.konshin/lint`, `husky`, `lint-staged` (+ the PNPM `.npmrc` block if pnpm).
2. **Config** — create/reconcile `.editorconfig`, `eslint.config.mjs` and `.prettierrc.mjs` (set `next.rootDir`, keep project rule overrides).
3. **Lint-staged** — create/reconcile `.lintstagedrc.mjs`.
4. **Husky** — `prepare/postinstall` (`prepare` by default, `postinstall` if Yarn 2+ is used AND root package.json is **private**) script; `.husky/pre-commit`, plus `eslint`/`prettier`/`lint`/`lint:staged` scripts. Drop a legacy `lint:all` if it duplicates `lint`.
5. **IDEA** — apply the file-scope glob patterns if the repo has a JetBrains `.idea`.
6. **Install** — run the package manager (`yarn` / `npm install` / `pnpm install`) so the new deps and Husky hooks land. Under Yarn 2+ check if root `package.json` has `prepare` script, and if it does, run it.

Check the README's "Issues" section before debugging a lint crash.

## B. Audit code against rules

Rules: `.claude/rules/*.md` → else `node_modules/@kirill.konshin/lint/rules/*.md`; plus overrides in `AGENTS.md # Custom Rules` / `CLAUDE.md` (override wins on conflict). Treat rule files as normative — read them directly.

### 1. Mechanical pass first

Run `eslint .` and `prettier --check .` **without `--fix`**. Report compactly (counts + notable files). Ask: fix all / pick / skip. Apply the confirmed fixes (`eslint --fix`, `prettier --write`). This cleans deterministic issues so the rule audit runs on a patched tree.

### 2. Rule audit

Scan the (now-patched) code for rule violations. **One line each, most critical first:**

`⟨CRIT|HIGH|MED|LOW⟩ path:line — <rule file> — <what's wrong>`

No multi-paragraph write-ups. Nothing found → say so and stop.

### 3. Ask once

Go one-by-one / reply with instructions / skip all / fix all. Do nothing until answered.

### 4. One-by-one

Per issue: **skip** / **skip + add override** / **fix** / **instructions**. For an override, offer only the applicable mechanism(s) and **name which one you'll write, showing the exact line/snippet first**:

- **ESLint override** (mechanical findings) — `// eslint-disable-next-line <rule>` at the site, or a rule entry in the project's `eslint.config.*` override block.
- **AI override → AGENTS.md** (rule-audit findings) — a general rule appended to `AGENTS.md # Custom Rules` (run `lint-prepare init` to create the file if missing). Prefer a general statement over a per-file exception unless it's genuinely a one-off.
- **both** — when the violation is covered by an ESLint rule _and_ an agent rule.

### 5. Report

Show the diff of everything changed.
