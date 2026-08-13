---
type: always_apply
description: NPM & Yarn patterns
---

- Prefer using Corepack for all new projects.
- Prefer Yarn v4+ for all new projects.

# Lifecycle Scripts: `prepare` vs `postinstall`

- ⚠️ ALWAYS put install-time setup (husky, codegen, cache warmup) in the install lifecycle — `prepare` by default, `postinstall` for a private root (tradeoff below)
- ⚠️ Yarn 2+ (Berry) skips top-level `prepare` on install ([lifecycle scripts](https://yarnpkg.com/advanced/lifecycle-scripts)) — run `yarn prepare` yourself / in CI. For a **private** root, prefer `postinstall`: Yarn does run it on install, so hooks land automatically (incl. CI) with no manual step and no [pinst](https://github.com/typicode/pinst) guard. Keep `prepare` for **published** packages — an unguarded `postinstall` would run on consumers' installs.

# Prefer Libraries with Long History

- Prefer libraries that have a long history of updates and are well-maintained, and are not deprecated.
- Always try to use the latest version of a library.
- Always try to find if there is a suitable library for a given task before writing custom code, ask user if library is not very popular.

# Hoisting

- Hoist everything: keep the package manager's DEFAULT hoisting — do not set `installConfig.hoistingLimits`/`nmHoistingLimits` or Yarn 1 `nohoist`; the historical React Native/Expo/Electron reasons are obsolete (Metro follows symlinks since RN 0.72, Expo SDK 54+ supports monorepos with any strategy, hoisting limits break Electron Forge and duplicate React instances)
- Electron + pnpm needs MORE hoisting, not less: set `node-linker=hoisted` (or `shamefully-hoist=true`) in `.npmrc`, otherwise packaged apps miss dependencies (electron-builder/electron-vite guidance)
- Binary packagers don't need hoisting limits either: bundle to a single file first (esbuild), then package — node_modules layout becomes irrelevant; use Node's SEA (stable since Node 22, one-step `--build-sea` since 25.5) or `@yao-pkg/pkg` (maintained fork of the deprecated `vercel/pkg`)
- Shared root configs (e.g. `@kirill.konshin/lint`) must be able to resolve leaf tools (`next`, `tailwindcss`, `storybook`, `jest`) from the workspace root:
    - npm / Yarn: default hoisting already exposes them
    - pnpm: add to `.npmrc`: `public-hoist-pattern[]=next`, `public-hoist-pattern[]=tailwindcss`, `public-hoist-pattern[]=storybook`, `public-hoist-pattern[]=jest` (`*eslint*`/`*prettier*` are hoisted by default)
    - Yarn PnP: declare the tools at the workspace root as well
- If lint fails with "not resolvable from the workspace root": apply the above or add the package to root `devDependencies`; run eslint with `LINT_DEBUG=1` to trace detection

# Consistent versions

In monorepos pin versions of sub-packages to the root; these packages cause issues when versions drift.

https://github.com/raineorshine/npm-check-updates/issues/1332#issuecomment-1717862332 https://docs.npmjs.com/cli/v8/configuring-npm/package-json#overrides

Root `package.json`:

```json
{
    "overrides": {
        "@types/node": "$@types/node",
        "@types/react": "$@types/react",
        "@types/react-dom": "$@types/react-dom",
        "next": "$next",
        "eslint": "$eslint",
        "typescript": "$typescript",
        "vite": "$vite"
    },
    "resolutions": {
        "@types/node": "^26",
        "@types/react": "^19",
        "@types/react-dom": "^19",
        "eslint": "^10",
        "next": "^16",
        "typescript": "^6",
        "vite": "^8"
    }
}
```

All other `package.json`:

```jsonc
{
    "devDependencies": {
        "next": "^16.0.0", // except next, see nextjs.md
        "typescript": "^6.0.0",
    },
}
```

Yarn does not apply npm `overrides`; `defineYarnConfig` reads them as constraints together with `resolutions`, keeps non-peer leaf ranges equal, and falls back to the listed default packages when `overrides` is absent.

Every package with `"packageManager": "yarn@..."` MUST directly install `@yarnpkg/types` and use:

```js
/** @type {import('@yarnpkg/types')} */
const { defineConfig } = require('@yarnpkg/types');
const { defineYarnConfig } = require('@kirill.konshin/lint/yarn');

module.exports = defineConfig(defineYarnConfig());
```

Run `yarn constraints --fix` after dependency changes.

# `.yarnrc.yml`

Make sure `yarnPath` is not specified, rely on `packageManager` in `package.json` and Corepack.

```yml
approvedGitRepositories:
    - '**'

compressionLevel: mixed

enableScripts: true

nodeLinker: node-modules

npmMinimalAgeGate: 0

# own packages are exempt from the minimum-release-age quarantine (npmMinimalAgeGate)
npmPreapprovedPackages:
    - '@kirill.konshin/*'
```

# Yalc (Local Package Linking)

Test unpublished packages in sibling projects (yalc is a root devDependency here):

1. `yarn nx run @kirill.konshin/<pkg>:build`
2. `cd packages/<pkg> && yarn yalc publish` (after changes: `yarn yalc publish --push` updates all linked consumers)
3. In the consumer: `npx yalc link @kirill.konshin/<pkg>` (or the yalc binary from this repo)

Rules:

- ALWAYS use `yalc link` (symlink mode: `node_modules/<pkg>` → local `.yalc/<pkg>` copy), NEVER `yalc add` — `add` writes `file:.yalc/...` into package.json
- While linked, `package.json`, `yarn.lock` and `.yarnrc.yml` MUST NOT be modified by the link — link artifacts break CI/other machines and must NEVER be committed; gitignore `.yalc/` and `yalc.lock` in the consumer
- The real dependency (e.g. `"@kirill.konshin/auth": "^0.0.1"`) is committed separately; the consumer's `yarn.lock` can only be updated after the version is actually published to npm
- The consumer resolves the linked package's own dependencies from its node_modules — they must be installed there (usually already are as the consumer's own deps)
- A later `yarn install` in the consumer removes the symlink — re-run `yalc link`
- Unlinking: `yalc remove --all` cleans `.yalc/` and `yalc.lock` but leaves dangling symlinks in `node_modules` — delete them before `yarn install`
- Yarn 4.17+ quarantines packages published <24h ago (`npmMinimalAgeGate`) — consumers need `npmPreapprovedPackages: ["@kirill.konshin/*"]` in `.yarnrc.yml` to install own packages right after release (older Yarn errors on that key — upgrade the consumer via `packageManager` first)
- `.yarnrc.local.yml` is NOT a thing (open Yarn feature request, local overrides only via `YARN_*` env vars) and yalc runs NO registry (it is a file store in `~/.yalc`), so a registry override cannot replace linking — `yalc link` is the only mode that leaves all manifests untouched
