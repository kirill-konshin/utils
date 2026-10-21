---
type: always_apply
description: Set of rules for projects with Playwright
paths:
    - '**/playwright.config.{ts,js,mjs,cjs}'
    - '**/e2e/**'
---

- The apps under test are started outside Playwright, never by its `webServer`: the e2e target `dependsOn` the continuous `start` / `dev` / `serve` targets plus their `wait` probes (`wait-on`), or Docker Compose runs the stack and the suite as a service; see [monorepo-turbo-nx.md](monorepo-turbo-nx.md)
- The suite reaches the apps through `baseURL` (and other URLs) from the environment, so the same specs run locally, in Compose and against a deployment
- E2E targets against running apps are `cache: false`; reports and traces (`test-results`, `playwright-report`) are their outputs and CI artifacts
- How Playwright splits the work:
    - `workers` — parallel worker processes on one machine (default: half of the cores)
    - test files run in parallel across workers; tests inside a file run in order unless `fullyParallel: true` (or `test.describe.configure({ mode: 'parallel' })`)
    - `projects` — every project (browser, runtime, device) runs the matching specs again
    - `--shard=<i>/<n>` — splits the suite across CI machines; merge the `blob` reports with `playwright merge-reports`
- Run serially (`workers: 1`, `fullyParallel: false`) when tests share external state — accounts, sessions, a stopped service, a stateful backend; say why in the config
- On CI: `forbidOnly`, `retries`, trace / video `on-first-retry`, screenshots `only-on-failure`, a JUnit report for the CI test widget and an HTML report as an artifact
