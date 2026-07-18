---
type: always_apply
description: NPM & Yarn patterns
---

- Prefer using Corepack for all new projects.
- Prefer Yarn v4+ for all new projects.

# Lifecycle Scripts: `prepare` vs `postinstall`

- ALWAYS put install-time setup (husky, codegen, cache warmup) in the `prepare` script — it never runs on consumers' installs of a published package, so it needs no guards
- Yarn 2+ (Berry) never runs a top-level `prepare` script on install — only `preinstall` / `install` / `postinstall` (see [Yarn lifecycle scripts](https://yarnpkg.com/advanced/lifecycle-scripts) and [Husky's How To](https://typicode.github.io/husky/how-to.html): "Yarn doesn't support prepare script"). npm, pnpm, bun and Yarn 1 do run `prepare`
- Under Yarn 2+ run `yarn prepare` explicitly: once after cloning, and as a dedicated CI step right after `yarn install` — steps like lint may silently degrade without it (e.g. `@nx/eslint-plugin` rules skip when the project graph cache is missing)
- Alternative for Yarn 2+ only if automatic runs are a must: move the setup to `postinstall`, but a published package's `postinstall` executes on consumers' installs — guard it with [pinst](https://github.com/typicode/pinst) (`"prepack": "pinst --disable"`, `"postpack": "pinst --enable"`) as [Husky recommends](https://typicode.github.io/husky/how-to.html); private packages don't need the guard
- Yarn Berry also skips all lifecycle scripts on no-op installs (nothing changed in `node_modules`); npm reruns `prepare` on every `npm install`

# Prefer Libraries with Long History

- Prefer libraries that have a long history of updates and are well-maintained, and are not deprecated.
- Always try to use the latest version of a library.
- Always try to find if there is a suitable library for a given task before writing custom code, ask user if library is not very popular.

# Consistent versions

In Monorepos pin versions of sub-packages to main.

https://github.com/raineorshine/npm-check-updates/issues/1332#issuecomment-1717862332
https://docs.npmjs.com/cli/v8/configuring-npm/package-json#overrides

Root `package.json`:

```json
{
    "installConfig": {
        "hoistingLimits": "dependencies"
    },
    "overrides": {
        "next": "$next",
        "eslint": "$eslint",
        "typescript": "$typescript"
    }
}
```

All other `package.json`:

```json5
{
    devDependencies: {
        next: '16.0.0', // except next, see nextjs.md
        typescript: '*', // vividly express version does not matter
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
