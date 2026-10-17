---
name: lint-migrate
description: Upgrade a project that uses @kirill.konshin/lint to a newer minor version - one section per version step (0.6 -> 0.7 moves ESLint + Prettier + lint-staged + Husky to Vite+). Use when upgrading @kirill.konshin/lint, or when asked to move a repo to Vite+ / Oxlint / Oxfmt.
---

# Lint Migrate

Only what changes between versions; the target setup is the package README (`node_modules/@kirill.konshin/lint/README.md`).

1. Check `git status`; ask the user to commit unrelated work
2. Apply each section from the installed version up to the target, in order; reconcile, never overwrite project settings
3. Run the `lint-repo` skill: set up / update tooling (checks every file against the README), then its audit

# 0.6 -> 0.7

0.7 recommends Vite+. Keep the ESLint / Prettier / lint-staged exports only if the user declines Vite+ or the project uses Yarn PnP.

- **Prerequisites**: Node `^22.18 || ^24.11 || >=26`, Vite 8+, Vitest 4.1+, `node-modules` linker
- **Set up** Vite+ by hand per the README "Vite+" section — not `vp migrate`: it copies every expanded ESLint rule, writes absolute paths and broken regexes, and rewrites dependencies; if it was run, replace its `lint` / `fmt` blocks with `vitePlusConfig`
- **Carry over**: rules from `eslint.config.*` → `lint.rules` / `lint.overrides` (`@typescript-eslint/x` → `typescript/x`, `react-hooks/x` → `react/x`, `import-x/x` → `import/x`, `@nx/*` unchanged); extra `.prettierignore` entries → `fmt.ignorePatterns`; root `vitest.config.*` → the `test` block
- **Remove**: `eslint.config.*`, `.prettierrc*`, `.prettierignore`, `.lintstagedrc*`, `vitest.config.*`, `tsdown.config.*` (→ `pack`), `.husky/` (→ `.vite-hooks/`; `git config --unset core.hooksPath`); dependencies `prettier`, `lint-staged`, `husky`, `vitest`, `tsdown`, `vite-plugin-dts`, `rollup-preserve-directives` — keep `eslint` only for `@nx/eslint-plugin`
- **Rewrite**: `from 'vitest'` → `from 'vite-plus/test'` (keep `declare module 'vitest'`); `defineConfig` from `vite-plus`; library `vite build` with `preserveModules` → `pack` with `unbundle: true`, `dts: true`, `deps: { neverBundle: true }`; inline disables of file-name rules → `lint.overrides`
- **Expect**: a one-time Oxfmt reformat (commit as `style:` / `chore:`); type errors the old setup never reported (`typeAware` is on), TS 7-removed tsconfig options (`target: es5`, `moduleResolution: node`, `downlevelIteration`) and TS 6's empty default `types` (list `["node", "vite-plus/client"]`); new Oxlint findings are real — fix, or override with a reason; `@nx/dependency-checks` is gone (Oxlint lints no JSON)
- **Verify**: every package's build and tests; `dist` file lists and `package.json` `exports` unchanged
