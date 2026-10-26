---
name: lint-npm-yarn
description: Yarn / npm / pnpm details for the npm-yarn rule - hoisting edge cases (Electron, pnpm, binary packagers), version pinning templates (`overrides`, `resolutions`, Vite+ pins), `.yarnrc.yml` template, CI install on a shared cache volume and speed-ups, Yalc linking procedure, first npm publish with OIDC. Use when changing package manager configuration, CI install, local package linking or publishing a new package.
---

The binding rules are in [rules/npm-yarn.md](../../rules/npm-yarn.md). This skill holds the details.

# Hoisting

- Hoist everything: the historical React Native/Expo/Electron reasons for hoisting limits are obsolete (Metro follows symlinks since RN 0.72, Expo SDK 54+ supports monorepos with any strategy, hoisting limits break Electron Forge and duplicate React instances)
- Electron + pnpm needs MORE hoisting, not less: set `node-linker=hoisted` (or `shamefully-hoist=true`) in `.npmrc`, otherwise packaged apps miss dependencies (electron-builder/electron-vite guidance)
- Electron + Next.js `output: 'standalone'` in a hoisted workspace: Next.js traces dependencies into `.next/standalone/node_modules`, beside the app folder `.next/standalone/<app>` — package that folder too (electron-builder `files`), never limit hoisting for it; see the `lint-electron` skill
- Binary packagers don't need hoisting limits either: bundle to a single file first, then package — node_modules layout becomes irrelevant; build Node SEA executables with `vp pack` (`exe`, Node ≥ 25.7) when Vite+ is used, else `@yao-pkg/pkg` (maintained fork of the deprecated `vercel/pkg`); a Next.js standalone server cannot be bundled into one file: ship its files as SEA assets and extract them on the first start
- Shared root configs (e.g. `@kirill.konshin/lint`) must be able to resolve leaf tools (`next`, `tailwindcss`, `storybook`, `jest`) from the workspace root:
    - npm / Yarn: default hoisting already exposes them
    - pnpm: add to `.npmrc`: `public-hoist-pattern[]=next`, `public-hoist-pattern[]=tailwindcss`, `public-hoist-pattern[]=storybook`, `public-hoist-pattern[]=jest` (`*eslint*`/`*prettier*` are hoisted by default)
- If lint fails with "not resolvable from the workspace root": apply the above or add the package to root `devDependencies`. Trace detection with `LINT_DEBUG=1 vp lint` (or `LINT_DEBUG=1 eslint .`)

# Consistent versions

Pin the shared packages at the root; they cause issues when versions drift ([npm `overrides`](https://docs.npmjs.com/cli/v8/configuring-npm/package-json#overrides), [why both fields](https://github.com/raineorshine/npm-check-updates/issues/1332#issuecomment-1717862332)). `yarn.config.cjs`, and how `defineYarnConfig` reads these fields: the package README, "Yarn constraints".

Root `package.json` with Vite+ (the default): `vite` is an alias of the Vite+ core, `vitest` is the version Vite+ bundles (`npm view vite-plus dependencies.vitest`), and `@vitest/*` packages match it exactly:

```json
{
    "devDependencies": {
        "vite": "npm:@voidzero-dev/vite-plus-core@^1.3.0",
        "vite-plus": "^1.3.0"
    },
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
        "vite": "npm:@voidzero-dev/vite-plus-core@^1.3.0",
        "vitest": "5.0.5"
    }
}
```

Without Vite+: `"vite": "^8"` in `resolutions`, no `vitest` entry.

Other `package.json` files use the same ranges (`next` always has a version, see [rules/nextjs.md](../../rules/nextjs.md)):

```jsonc
{
    "devDependencies": {
        "next": "^16.0.0",
        "typescript": "^6.0.0",
    },
}
```

# `.yarnrc.yml`

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

The basic rules are in [rules/npm-yarn.md](../../rules/npm-yarn.md#install-on-ci). Platform steps: the `lint-github` skill and the `lint-gitlab` skill.

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

Test unpublished `@kirill.konshin/*` packages in sibling projects (yalc is a root devDependency of the `kirill-konshin/utils` repository):

1. `yarn nx run @kirill.konshin/<pkg>:build`
2. `cd packages/<pkg> && yarn yalc publish` (after changes: `yarn yalc publish --push` updates all linked consumers)
3. In the consumer: `npx yalc link @kirill.konshin/<pkg>` (or the yalc binary from the `kirill-konshin/utils` repository)

Pitfalls (the `yalc link` / commit rules: [rules/npm-yarn.md](../../rules/npm-yarn.md#yalc)):

- `yalc link` is symlink mode: `node_modules/<pkg>` points at a local `.yalc/<pkg>` copy. While linked, `package.json`, `yarn.lock` and `.yarnrc.yml` stay unchanged
- The real dependency (e.g. `"@kirill.konshin/auth": "^0.0.1"`) is committed separately; the consumer's `yarn.lock` can only be updated after the version is actually published to npm
- The consumer resolves the linked package's own dependencies from its node_modules — they must be installed there (usually already are as the consumer's own deps)
- A later `yarn install` in the consumer removes the symlink — re-run `yalc link`
- Unlinking: `yalc remove --all` cleans `.yalc/` and `yalc.lock` but leaves dangling symlinks in `node_modules` — delete them before `yarn install`
- Yarn 4.17+ quarantines packages published <24h ago (`npmMinimalAgeGate`) — consumers need `npmPreapprovedPackages: ["@kirill.konshin/*"]` in `.yarnrc.yml` to install own packages right after release (older Yarn errors on that key — upgrade the consumer via `packageManager` first)
- `.yarnrc.local.yml` is NOT a thing (open Yarn feature request, local overrides only via `YARN_*` env vars) and yalc runs NO registry (it is a file store in `~/.yalc`), so a registry override cannot replace linking — `yalc link` is the only mode that leaves all manifests untouched

# First Publish with OIDC

- Bootstrap a new npm package once from a locally authenticated session with `npm publish --access public --tag bootstrap`; complete npm's interactive 2FA challenge, or use `--otp=<code>` for TOTP.
- Configure its GitHub trusted publisher with the repository owner, repository name and release workflow file. For `@kirill.konshin/*` packages these are: organization/user `kirill-konshin`, repository `utils`, workflow `release.yml`, optional environment `npm-publish`. Check **Allow npm publish**.
- Under Publishing access, check **Require two-factor authentication and disallow bypass 2FA tokens (recommended)**; OIDC publishes remain allowed and should be used for every normal release.
- The first conventional `feat` release establishes the normal `latest` version.
