---
type: always_apply # or agent_requested
description: NPM & Yarn patterns # Required for agent_requested
---

_EVERY_ repo must adhere to policy unless explicitly prohibited in comment before the action or workflow definition.

# Prefer Libraries with Long History

Prefer libraries that have a long history of updates and are well-maintained, and are not deprecated.
Always try to use the latest version of a library.
Always try to find if there is a suitable library for a given task before writing custom code, ask user if library is not very popular.

# Consistent versions

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
        next: '16.0.0', // this has to be a valid version, otherwise Vercel will fall into legacy mode instead of serverless
        typescript: '*', // this should be * so that version is consistent and it's dead obvious
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
