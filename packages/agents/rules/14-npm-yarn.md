---
type: always_apply # or agent_requested
description: NPM & Yanr patterns # Required for agent_requested
---

_EVERY_ repo must adhere to policy unless explicitly prohibited in comment before the action or workflow definition.

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

```json
{
    "devDependencies": {
        "next": "*",
        "typescript": "*"
    }
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
