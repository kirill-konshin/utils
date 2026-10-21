---
type: always_apply
description: NPM & Yarn patterns
paths:
    - '**/package.json'
    - '**/.yarnrc.yml'
    - '**/yarn.config.cjs'
    - '**/.npmrc'
    - '**/pnpm-workspace.yaml'
    - '**/.github/**/*.yml'
    - '**/.github/**/*.yaml'
    - '**/.gitlab-ci.yml'
    - '**/.gitlab/**/*.yml'
    - '**/.gitlab/**/*.yaml'
---

Templates, procedures and details: the `lint-npm-yarn` skill.

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

- Hoist everything: keep the DEFAULT hoisting of the package manager. Do not set `installConfig.hoistingLimits`, `nmHoistingLimits` or Yarn 1 `nohoist`.
- Shared root configs (e.g. `@kirill.konshin/lint`) must resolve leaf tools (`next`, `tailwindcss`, `storybook`, `jest`) from the workspace root.
- Electron, pnpm, binary packagers, "not resolvable from the workspace root": see the `lint-npm-yarn` skill.

# Consistent versions

- In monorepos, pin the versions of shared packages at the root (`overrides` + `resolutions`). Drift in these versions causes issues.
- Every package with `"packageManager": "yarn@..."` MUST install `@yarnpkg/types` and use `defineYarnConfig` from `@kirill.konshin/lint/yarn` in `yarn.config.cjs`.
- Run `yarn constraints --fix` after dependency changes.
- Do not specify `yarnPath` in `.yarnrc.yml`. Use `packageManager` in `package.json` and Corepack.

# Install on CI

The single source for CI install rules. Platform steps: [github.md](github.md), [gitlab.md](gitlab.md). Shared cache volume and speed-up options: the `lint-npm-yarn` skill.

- On CI, set `YARN_ENABLE_GLOBAL_CACHE=false`. Yarn then keeps all packages in `.yarn/cache`, and CI caches this folder.
- Cache only `.yarn/cache`. NEVER cache `node_modules`: it has too many files to pack and unpack quickly.
    - Exception: the Vite+ task cache `node_modules/.vite/task-cache` (experimental, https://viteplus.dev/guide/github-actions-cache). Measure first. Restore it after install. Use a rolling key `vite-task-<os>-<arch>-<run id>` with a `vite-task-<os>-<arch>-` restore prefix. Do not put sources or lockfiles in the key: Vite Task fingerprints them.
- IF parallel jobs follow the install, add an `install` job. This job fills the Yarn cache and saves it. The other jobs only read it.
- IF the pipeline has one job, or its jobs run one after another, do not add an `install` job.
- IF in doubt, keep `nodeLinker: node-modules`.

# Yalc

- ALWAYS use `yalc link`, NEVER `yalc add` — `add` writes `file:.yalc/...` into package.json
- NEVER commit link artifacts; gitignore `.yalc/` and `yalc.lock` in the consumer
- Procedure and pitfalls: the `lint-npm-yarn` skill

# Publishing

- Never bootstrap, publish, or push a release without explicit approval.
- First publish of a new package with OIDC: the `lint-npm-yarn` skill.
