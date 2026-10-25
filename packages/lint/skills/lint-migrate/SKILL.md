---
name: lint-migrate
description: Upgrade a project that uses @kirill.konshin/lint to a newer minor version - one section per version step (0.6 -> 0.7 moves ESLint + Prettier + lint-staged + Husky to Vite+; 0.7 -> 0.8 moves all settings into one lint.config.ts and installs skills with the skills CLI). Use when upgrading @kirill.konshin/lint, or when asked to move a repo to Vite+ / Oxlint / Oxfmt.
---

# Lint Migrate

Only what changes between versions; the target setup is the package README (`node_modules/@kirill.konshin/lint/README.md`).

1. Check `git status`; ask the user to commit unrelated work
2. Apply each section from the installed version up to the target, in order; reconcile, never overwrite project settings
3. Run the `lint-repo` skill: set up / update tooling (checks every file against the README), then its audit

# 0.7 -> 0.8

All settings move into one `lint.config.ts` in the workspace root (README "`lint.config.ts`"). `lint-prepare` installs the skills with the `skills` CLI (README "How it works"), not with its own links.

- **Prerequisites**: Node `^22.18` or later (Node loads `lint.config.ts` with type stripping); `"type": "module"` in the root `package.json` (check that root `.js` files are ESM, rename CommonJS ones to `.cjs`)
- **Write** `lint.config.ts` by hand from the options the configs pass today, also when every option is a default (`defineLintConfig({})`); import `defineLintConfig` (and `tsExts`, `scanWorkspace`) from `@kirill.konshin/lint/config`
    - `vitePlusConfig(config, toggles)`: toggles → top-level keys; `typeAware` → `vitePlus.typeAware`; the `config` blocks (`lint`, `fmt`, `staged`, `test`, …) → the `vitePlus` key; then `vite.config.ts` is `export default defineConfig(vitePlusConfig());`
    - `defineLintConfig(options)` (ESLint) options → top-level keys; `typeAware` and `defaultIgnore` → `eslint.typeAware`, `eslint.defaultIgnore`
    - A root `package.json` `skills` field → the `skills` map, keyed by source: `{ "source": "a/b", "ref": "x", "skills": ["s"] }` → `'a/b': { ref: 'x', skills: { s: true } }`; remove the field
    - Per-package differences in a monorepo stay in the configs, as overrides: one `lint.config.ts` only, never one per package
- **Rewrite**: `defineLintConfig` from `@kirill.konshin/lint` (ESLint) → `eslintConfig(overrides)`; `vitePlusConfig` returns a `Promise` — keep `defineConfig(vitePlusConfig(...))`, `defineConfig` accepts it; code that reads the result awaits it; `VitePlusOptions` / `LintOptions` → `LintConfig`
- **Add** `skills-lock.json` to `.gitignore`; `vite-plus` to `devDependencies` when the project does not use Vite+ (a required peer now: it types `lint.config.ts`)
- **Expect**: `lint-prepare` replaces its old skill links on the first run; on a fresh clone it fetches the default remote skills from GitHub (on CI, with `CI` set, it does not); it removes remote skills of `skills-lock.json` that `lint.config.ts` does not list
- **Remove** a copy of a default skill that the project or `~/.claude/skills` keeps by hand (e.g. from `npx skills add`): a personal skill overrides the project one, a project folder blocks the sync of that name; turn off unwanted defaults in the `skills` map instead
- **Verify**: `vp check` (or ESLint) passes with the same findings; `.agents/skills` and `.claude/skills` list the package skills and the configured skills; `git status` shows none of them

# 0.6 -> 0.7

0.7 recommends Vite+. Keep the ESLint / Prettier / lint-staged exports only if the user declines Vite+. Do not use Yarn PnP ([rules/npm-yarn.md](../../rules/npm-yarn.md)). IF the project uses PnP, ask the user to move it to `nodeLinker: node-modules` first.

- **Prerequisites**: Node `^22.18 || ^24.11 || >=26`, Vite 8+, Vitest 4.1+, `node-modules` linker
- **Set up** Vite+ by hand per the README "Vite+" section — not `vp migrate`: it copies every expanded ESLint rule, writes absolute paths and broken regexes, and rewrites dependencies; if it was run, replace its `lint` / `fmt` blocks with `vitePlusConfig`
- **Carry over**: rules from `eslint.config.*` → `lint.rules` / `lint.overrides` (`@typescript-eslint/x` → `typescript/x`, `react-hooks/x` → `react/x`, `import-x/x` → `import/x`, `@nx/*` unchanged); extra `.prettierignore` entries → `fmt.ignorePatterns`; root `vitest.config.*` → the `test` block
- **Remove**: `eslint.config.*`, `.prettierrc*`, `.prettierignore`, `.lintstagedrc*`, `vitest.config.*`, `tsdown.config.*` (→ `pack`), `.husky/` (→ `.vite-hooks/`; `git config --unset core.hooksPath`); dependencies `prettier`, `lint-staged`, `husky`, `vitest`, `tsdown`, `vite-plugin-dts`, `rollup-preserve-directives` — keep `eslint` only for `@nx/eslint-plugin`
- **Rewrite**: `from 'vitest'` → `from 'vite-plus/test'` (keep `declare module 'vitest'`); `defineConfig` from `vite-plus`; library `vite build` with `preserveModules` → `pack` with `unbundle: true`, `dts: true`, `deps: { neverBundle: true }`; inline disables of file-name rules → `lint.overrides`
- **Expect**: a one-time Oxfmt reformat (commit as `style:` / `chore:`); type errors the old setup never reported (`typeAware` is on), TS 7-removed tsconfig options (`target: es5`, `moduleResolution: node`, `downlevelIteration`) and TS 6's empty default `types` (list `["node", "vite-plus/client"]`); new Oxlint findings are real — fix, or override with a reason; `@nx/dependency-checks` is gone (Oxlint lints no JSON)
- **Verify**: every package's build and tests; `dist` file lists and `package.json` `exports` unchanged
