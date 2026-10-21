---
type: always_apply
description: NPM & Yarn patterns
---

- Prefer using Corepack for all new projects.
- Prefer Yarn v4+ for all new projects.

# Vite+

- IF `vite-plus` is installed, use `vp` commands: `vp check` (format + lint + type checks), `vp lint`, `vp fmt`, `vp test`, `vp pack` (libraries), `vp build` (apps), `vp staged`, `vp config` (git hooks)
- Workspace-wide root scripts use `vp run`, not `yarn workspaces foreach`: `"build": "vp run -r build"` (dependency order), `"start": "vp run -r --parallel start"`, `"clean": "vp run -r clean && rm -rf node_modules"`; `-r` includes the root package, so the root script's other steps run too
- IF `vite-plus` is not installed, use the old style: package scripts with ESLint, Prettier, lint-staged, Husky
- Vite+ requires the `node-modules` linker (no Yarn PnP) and pins `vite` to its core and `vitest` to its bundled version at the root (see the `@kirill.konshin/lint` README)
- NEVER use Yarn PnP (`nodeLinker: pnp`): Vite+ and most tools need `node_modules`. Move a project on PnP to `nodeLinker: node-modules`.

# Lifecycle Scripts: `prepare` vs `postinstall`

- ⚠️ ALWAYS put install-time setup (git hooks: `vp config` or `husky`, codegen, cache warmup) in the install lifecycle — `prepare` by default, `postinstall` for a private root (tradeoff below)
- ⚠️ Yarn 2+ (Berry) skips top-level `prepare` on install ([lifecycle scripts](https://yarnpkg.com/advanced/lifecycle-scripts)) — run `yarn prepare` yourself / in CI. For a **private** root, prefer `postinstall`: Yarn does run it on install, so hooks land automatically (incl. CI) with no manual step and no [pinst](https://github.com/typicode/pinst) guard. Keep `prepare` for **published** packages — an unguarded `postinstall` would run on consumers' installs.

# Prefer Libraries with Long History

- Prefer libraries that have a long history of updates and are well-maintained, and are not deprecated.
- Always try to use the latest version of a library.
- Always try to find if there is a suitable library for a given task before writing custom code, ask user if library is not very popular.

# Hoisting

- Hoist everything: keep the package manager's DEFAULT hoisting — do not set `installConfig.hoistingLimits`/`nmHoistingLimits` or Yarn 1 `nohoist`; the historical React Native/Expo/Electron reasons are obsolete (Metro follows symlinks since RN 0.72, Expo SDK 54+ supports monorepos with any strategy, hoisting limits break Electron Forge and duplicate React instances)
- Electron + pnpm needs MORE hoisting, not less: set `node-linker=hoisted` (or `shamefully-hoist=true`) in `.npmrc`, otherwise packaged apps miss dependencies (electron-builder/electron-vite guidance)
- Electron + Next.js `output: 'standalone'` in a hoisted workspace: Next.js traces dependencies into `.next/standalone/node_modules`, beside the app folder `.next/standalone/<app>` — package that folder too (electron-builder `files`), never limit hoisting for it; see the `lint-electron` skill
- Binary packagers don't need hoisting limits either: bundle to a single file first, then package — node_modules layout becomes irrelevant; build Node SEA executables with `vp pack` (`exe`, Node ≥ 25.7) when Vite+ is used, else `@yao-pkg/pkg` (maintained fork of the deprecated `vercel/pkg`); a Next.js standalone server cannot be bundled into one file: ship its files as SEA assets and extract them on the first start
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

# print install-time script output (postinstall / prepare, dependency builds) live instead of buffering it into a log
enableInlineBuilds: true

enableScripts: true

nodeLinker: node-modules

npmMinimalAgeGate: 0

# own packages are exempt from the minimum-release-age quarantine (npmMinimalAgeGate)
npmPreapprovedPackages:
    - '@kirill.konshin/*'
```

# Install on CI

The single source for CI install rules. Platform steps: github.md, gitlab.md.

- On CI, set `YARN_ENABLE_GLOBAL_CACHE=false`. Yarn then keeps all packages in `.yarn/cache`, and CI caches this folder.
- Cache only `.yarn/cache`. NEVER cache `node_modules`: it has too many files to pack and unpack quickly.
    - Exception: the Vite+ task cache `node_modules/.vite/task-cache` (experimental, https://viteplus.dev/guide/github-actions-cache). Measure first. Restore it after install. Use a rolling key `vite-task-<os>-<arch>-<run id>` with a `vite-task-<os>-<arch>-` restore prefix. Do not put sources or lockfiles in the key: Vite Task fingerprints them.
- IF parallel jobs follow the install, add an `install` job. This job fills the Yarn cache and saves it. The other jobs only read it.
- IF the pipeline has one job, or its jobs run one after another, do not add an `install` job.
- Exception: a shared cache volume. IF all runners mount the same volume (for example a Kubernetes PVC):
    - Set `YARN_ENABLE_GLOBAL_CACHE=true` and put the Yarn global folder on the volume (`YARN_GLOBAL_FOLDER`). Do not use the CI cache for packages.
    - Hardlinks do not cross filesystems. Yarn hardlinks package files from `<globalFolder>/index`. The `node-modules` linker then copies instead and downgrades `nmMode: hardlinks-global` to `hardlinks-local`. The `pnpm` linker has no fallback: it fails with "cross-device link".
    - With Yarn's `nodeLinker: pnpm`, put `pnpmStoreFolder` on the same volume as the global folder, one folder per branch (`/cache/yarn/store/$CI_COMMIT_REF_SLUG`). The link step then takes seconds.
    - Each Yarn `pnpm` install deletes all store entries that it does not use. The per-branch folder keeps installs on other branches away from your store.
    - With pnpm, set `store-dir` on the volume.
    - Clean the volume with a scheduled job: the global cache only grows, and the stores of deleted branches stay.
- IF `yarn install` is still the CI bottleneck, measure it and evaluate alternatives. The principles of [Speed up NPM/Yarn install in Gitlab](https://www.konshin.org/publications/speed-up-npm-yarn-install-in-gitlab) ([Medium](https://medium.com/disdj/speed-up-npm-yarn-install-in-gitlab-1434437f9857)) still apply. Its tools are outdated.
    - A faster linker: Yarn's `nodeLinker: pnpm` often links faster than `node-modules`, and pnpm is faster still. Both layouts are strict and not hoisted (see Hoisting). Undeclared dependencies fail, and Electron needs a hoisted layout. `@kirill.konshin/lint` is not verified with them.
    - Jobs that need only some workspaces: `yarn workspaces focus <workspace>`
    - A CI image with the dependencies installed
- IF in doubt, keep `nodeLinker: node-modules`.

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

# First Publish with OIDC

- Never bootstrap, publish, or push a release without explicit approval.
- Bootstrap a new npm package once from a locally authenticated session with `npm publish --access public --tag bootstrap`; complete npm's interactive 2FA challenge, or use `--otp=<code>` for TOTP.
- Configure its GitHub trusted publisher for organization/user `kirill-konshin`, repository `utils`, workflow `release.yml`, optional environment `npm-publish`, and check **Allow npm publish**.
- Under Publishing access, check **Require two-factor authentication and disallow bypass 2FA tokens (recommended)**; OIDC publishes remain allowed and should be used for every normal release.
- The first conventional `feat` release establishes the normal `latest` version.
