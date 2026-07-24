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

In Monorepos pin versions of sub-packages to main.

https://github.com/raineorshine/npm-check-updates/issues/1332#issuecomment-1717862332
https://docs.npmjs.com/cli/v8/configuring-npm/package-json#overrides

Root `package.json`:

```json
{
    "overrides": {
        "next": "$next",
        "eslint": "$eslint",
        "typescript": "$typescript"
    }
}
```

All other `package.json`:

```jsonc
{
    "devDependencies": {
        "next": "16.0.0", // except next, see nextjs.md
        "typescript": "*", // vividly express version does not matter
    },
}
```

# `.yarnrc.yml`

```yml
yarnPath: .yarn/releases/yarn-4.5.1.cjs
nodeLinker: node-modules
# compressionLevel: mixed
# enableGlobalCache: false
# checksumBehavior: update
```
