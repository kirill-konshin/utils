---
type: always_apply
description: Set of rules for MONOREPO projects which use Turbo or NX
paths:
    - '**/turbo.json'
    - '**/nx.json'
    - '**/package.json'
---

- Existing projects may use what they use
- Root `package.json` defines:
    - Public entrypoints for use in other tools (like `lint-staged`, CLI, Webstorm, CI) & useful presets
    - Tasks to launch inner tasks (main `build` that launches `build` in each sub-package)
- Inner `package.json` MUST only define atomic orchestrator-agnostic tasks
- Prefer NX for new projects
- If NX is used root `package.json` must have `nx show projects > /dev/null` in `prepare` script, so the project graph cache exists for tools that read it outside `nx` — e.g. `@nx/eslint-plugin` rules in a bare `eslint` run silently skip without it. Yarn 2+ never runs `prepare` on install (see [lifecycle scripts](npm-yarn.md)), so run `yarn prepare` explicitly: once after cloning, and as a CI step after `yarn install`

# The `dependsOn: ["^wait"]` Pattern

https://github.com/vercel/turborepo/issues/1497
https://github.com/vercel/turborepo/discussions/1299

Neither Turbo nor NX can run `persistent` or `continuous` dependent tasks in order. If package `A` depends on `B` and both have `start` command, in freshly checked out repo `A` will fail as `B` does not have anything built yet. Besides, two continuous tasks can't depend on each other as neither will ever exit. Options are:

1. ❌ Build-then-start: waste of resources, since `start` will overwrite `build` and in most cases `build` cache is not useful, and `start` won't be smart enough by itself (DO NOT USE THIS APPROACH)
2. ✅ Probe-before-start: condition `start` of `A` to wait for `B` to produce consumable artifacts

The `start` task uses `"dependsOn": ["^wait"]` (upstream):

```json
{
    "start": {
        "persistent": true,
        "cache": false,
        "dependsOn": ["^wait"]
    }
}
```

## How it works

1. Package `A` has `"dependsOn": ["^wait"]`, which runs `wait` task of all upstream (dependency) packages
2. Upstream package `B`'s `wait` task uses some probe, like `wait-on ./dist/index.js` or `wait-on http://localhost:3000` to block exit (must be defined in package `B`, so it can self-identify when it's ready)
3. `B` also runs `"start": "build --watch"` task (for example) which produces `dist/index.js`
4. Once the file exists, `B`'s `wait-on` unblocks and exits, and `A`'s `start` can proceed
5. If file existed before, `A` starts immediately, the only issue could be `A`'s double-build if `B`'s `start` will eventually modify the file, causing `A`'s watcher to rebuild

# Task Consistency

ALWAYS verify `turbo.json` or `nx.json` task definitions when modifying scripts or package structure:

1. **Task inheritance**: Common tasks like `build`, `clean`, `test`, `start`, `wait` should be defined in root `turbo.json` and inherited by all packages
2. **Package `turbo.json` or `nx.json` or `nx` section of `package.json`**: Only override when needed (e.g., adding `dependsOn` or custom `outputs`)
3. **Check `dependsOn`**: Ensure build dependencies match actual package dependencies (e.g., `"dependsOn": ["^build"]` for packages that depend on other workspace packages)
4. **Check `outputs`**: Must include all build artifacts (`dist/**/*`, `package.json`: all modified & generated files)
5. **Cache settings**: `clean`, `wait`, `start` should have `"cache": false`
