---
type: always_apply
description: Set of rules for MONOREPO projects which use Turbo, NX or Vite+
paths:
    - '**/turbo.json'
    - '**/nx.json'
    - '**/package.json'
    - '**/project.json'
    - '**/vite.config.ts'
---

- Existing projects may use what they use
- Root `package.json` defines:
    - Public entrypoints for use in other tools (like `lint-staged`, CLI, Webstorm, CI) & useful presets
    - Tasks to launch inner tasks (main `build` that launches `build` in each sub-package)
- Inner `package.json` MUST only define atomic orchestrator-agnostic tasks
- Repo-wide defaults (parallelism, worker counts, cache and tool settings) live in env files (`.env`) or tool configs (`nx.json`, `turbo.json`, `vite.config.ts`), NEVER in `package.json` scripts — scripts stay as simple as possible; CI-specific behavior is set on the CI command (flags or env) where it is needed

# Orchestrator Choice

- IF NX Release publishes the packages, use NX for cache and task management
- ELSE use Vite+ (`vp run`) — the default
- IF Turbo is already used, keep it and offer to migrate: to NX if NX Release publishes, else to Vite+

# Vite+ Task Runner

https://viteplus.dev/guide/cache

- Only `vp run` caches; a direct `vp build` / `vp test` does not
- Define cacheable tasks in `vite.config.ts` `run.tasks` (cached by default); `package.json` scripts are cached only with `--cache` or `run.cache.scripts: true`
- `clean`, `wait`, `start` / `dev` tasks: `cache: false`
- Tasks run in a clean environment: list env vars that change outputs in `cache.env`, pass-through ones in `cache.untrackedEnv`
- Verify each task: the second `vp run <task>` MUST print `cache hit`; else fix `cache.input` / `cache.output`
- Cache lives in `node_modules/.vite/task-cache`; clear with `vp cache clean`; CI reuse: see [npm-yarn.md](npm-yarn.md#install-on-ci)
- No `affected` command: PR runs are fast only when CI restores the task cache
- Concurrency defaults to 4 tasks: `--concurrency-limit` or `VP_RUN_CONCURRENCY_LIMIT`; `--parallel` is unlimited

# Test Ownership

- The orchestrator (Nx / Turbo) runs every task, tests included, with its cache: the full run (`nx run-many -t test`, `turbo run test`) on `main`/`master` — unchanged packages are cache hits — and the affected run on PRs (`nx affected -t test`, `turbo run test --affected`)
- The test tool at the root (Vitest `test.projects`, Jest `projects`) is the local / IDE full-speed run: one worker pool over every package, all cores, no cache
- Inside an orchestrator task a test runner takes half of the cores, as the orchestrator runs several tasks at once (Nx: detect with `NX_TASK_TARGET_PROJECT`)
- Type checking (`vp check`, `tsc`) resolves workspace packages through their built declarations: CI lint jobs run after the build job (`needs: build`) and build the packages first through the orchestrator (cache hits), and so does a fresh clone before `lint`
- Suites that need running apps (e2e, integration): the orchestrator starts them — the test target `dependsOn` the continuous `start` / `dev` / `serve` plus a `wait` probe, `cache: false` — or Docker Compose does; the test tool never starts them (Playwright `webServer`), see [playwright.md](playwright.md) and [testing.md](testing.md)

# Task Consistency

ALWAYS verify `turbo.json` or `nx.json` task definitions when modifying scripts or package structure:

1. **Task inheritance**: Common tasks like `build`, `clean`, `test`, `start`, `wait` should be defined in root `turbo.json` or `nx.json` and inherited by all packages
2. **Package `turbo.json` or `nx.json` or `nx` section of `package.json`**: Only override when needed (e.g., adding `dependsOn` or custom `outputs`)
3. **Check `dependsOn`**: Ensure build dependencies match actual package dependencies (e.g., `"dependsOn": ["^build"]` for packages that depend on other workspace packages)
4. **Check `outputs`**: Must include all build artifacts (`dist/**/*`, `package.json`: all modified & generated files)
5. **Cache settings**: `clean`, `wait`, `start` should have `"cache": false`

# The `dependsOn: ["^wait"]` Pattern

- https://github.com/vercel/turborepo/issues/1497
- https://github.com/vercel/turborepo/discussions/1299
- https://turborepo.dev/docs/guides/coordinating-runtime-dependencies

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

For Turbo sibling runtime services (`web` <> `api`, not a package dependency) see the `with` + `wait` pattern in [turbo.md](turbo.md).

## Vite+

Vite Task has no `persistent` / `continuous` tasks (verified on 1.3.0):

- `vp run -r start` waits for upstream `start` to exit, so downstream `start` never starts, `^wait` or not (https://github.com/voidzero-dev/vite-task/issues/258)
- `--parallel` ignores every `dependsOn`, `^wait` included
- `dependsOn` a persistent task is not supported (https://github.com/voidzero-dev/vite-task/issues/416)

Chain the upstream probe inside the downstream command instead:

- Root: `"start": "vp run -r --parallel start"`
- Downstream package `A`: `"start": "vp run --filter 'A^...' wait && <watcher>"` — write the package name, `.^...` does not resolve
- Upstream package `B` defines `wait` as above
- Stopping only the `vp` process orphans its tasks; stop the whole process group (https://github.com/voidzero-dev/vite-plus/issues/3090)
