---
type: always_apply
description: Set of rules for MONOREPO projects which use Turbo or NX
paths:
    - '**/turbo.json'
    - '**/package.json'
---

# Root

```jsonc
{
    "$schema": "https://turbo.build/schema.json",
    "globalDependencies": ["tsconfig.json"],
    "tasks": {
        // define task defaults

        "build": {},
        "wait": {
            "cache": false,
        },
        "test": {
            "outputs": ["coverage/**/*"],
        },
        "start": {
            "persistent": true,
            "cache": false,
            "dependsOn": ["^wait"],
        },

        // root tasks

        "//#lint": {
            "cache": false,
        },
    },
}
```

# Leaf

```jsonc
{
    "$schema": "https://turbo.build/schema.json",
    "extends": ["//"],
    "tasks": {
        "build:demo": {
            "dependsOn": ["^build"],
            // list minimal amount of inputs & outputs
            "inputs": ["$TURBO_DEFAULT$", "src/**/*", "assets/**/*"],
            "outputs": ["dist/**/*"],
            // list all ENV that affect build and must invalidate cache
            "env": ["CSC_KEY_PASSWORD", "CSC_IDENTITY_AUTO_DISCOVERY"],
        },
    },
}
```

# Runtime Services: `with` + `wait` (e.g. `web` <> `api`)

https://turborepo.dev/docs/guides/coordinating-runtime-dependencies

When an app needs a sibling service running in dev (`web` needs `api`), combine:

- `"with": ["api#start"]` — launches the service alongside, so `turbo run start --filter=web` brings up both (convenience instead of whole-repo `start`)
- `"dependsOn": ["api#wait"]` — blocks `web#start` until the readiness probe exits
- Name the probe task `wait` (NOT `dev:ready` as in the Turbo guide) — same task the `^wait` pattern uses (see monorepo-turbo-nx.md)
- NEVER put persistent tasks in `dependsOn` — they never exit, so dependents never unblock; depend on the finite `wait` probe
- `wait` lives in the service package so it self-identifies readiness: `"wait": "wait-on http://localhost:3001/health"` (URL, TCP port, file, socket)
- Task overrides replace, they don't merge — keep `^wait` when overriding `start`
- Run with at least `--concurrency=3` (a slot per persistent task + the probe)

```jsonc
// ./apps/web/turbo.json
{
    "extends": ["//"],
    "tasks": {
        "start": {
            "with": ["api#start"],
            "dependsOn": ["^wait", "api#wait"],
        },
    },
}
```
