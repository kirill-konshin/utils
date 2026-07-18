---
name: eslint-config-next-custom
description: Install or update this repo's ESLint + Prettier + lint-staged + Husky setup using @kirill.konshin/eslint-config-next-custom. Use when asked to set up, configure, or upgrade lint/format/pre-commit tooling in a Next.js repo.
---

# ESLint + Prettier + Lint Staged + Husky Setup

Full instructions: @README.md
@import README.md

## Setting up in a new repo

Follow the README section by section:

1. **Installation** — add the dependencies listed there (`eslint`, `prettier`, `@kirill.konshin/eslint-config-next-custom`, `husky`, `lint-staged`), plus the PNPM `.npmrc` block if the repo uses pnpm.
2. **Settings** — create `eslint.config.mjs` and `.prettierrc.mjs` exactly as shown, adjusting the `next.rootDir` path and adding any project-specific rule overrides.
3. **Lint Staged** — create `.lintstagedrc.mjs`.
4. **Husky** — add the `prepare` script and `.husky/pre-commit` hook, plus the `eslint` / `prettier` / `lint` / `lint:staged` scripts to `package.json`. If the repo uses Yarn 2+, run `yarn prepare` once to install the hooks and tell the user that fresh clones need the same — see the README's Husky section.
5. **IDEA settings** — if the repo has a JetBrains `.idea` project, apply the file-scope patterns from the README's "IDEA settings" section.

## Updating an existing installation

Compare the repo's current `eslint.config.mjs`, `.prettierrc.mjs`, `.lintstagedrc.mjs`, Husky hook, and `package.json` scripts against the README and reconcile any drift — don't blindly overwrite project-specific rule overrides.

If existing `lint:all` NPM script is detected, and it is similar to `lint` defined by the README, remove `lint:all`, it is a legacy one.

## Known issues

Check the README's "Issues" and "Notes" sections before debugging a lint crash — several ESLint 9/10 + Next.js interop issues are already tracked there.
