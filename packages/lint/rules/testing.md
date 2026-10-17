---
type: always_apply
description: Set of rules for projects with tests
paths:
    - '**/jest.config.{ts,js,mjs,cjs}'
    - '**/vite.config.{ts,js,mjs,cjs}'
    - '**/vitest.config.{ts,js,mjs,cjs}'
    - '**/vitest.*.config.{ts,js,mjs,cjs}'
    - '**/*.test.*'
    - '**/*.spec.*'
    - '**/*.fixture.*'
---

- If project use `vite` or `vite-plus` use `vitest` (`vp test`, imports from `vite-plus/test`), otherwise `jest`
- With Nx / Turbo, CI runs tests through the orchestrator and its cache (full and affected); the test tool at the root over all projects (`vp test` with `test.projects`, `maxWorkers: '100%'`) is the local full-speed run (see monorepo-turbo-nx.md)
- If project needs browser-based testing use `playwright`; it splits work over worker processes, test files and `--shard`s (see playwright.md)
- Suites that need a real server (integration, e2e — Vitest / Jest too): a separate test config and target (e.g. `test:integration` with `vitest.integration.config.ts` over `*.spec.ts`), started by the orchestrator — `dependsOn` the continuous `dev` / `start` plus a `wait` probe, `cache: false` — with a JUnit report; a CI job against an external environment may be allowed to fail, and is not created where its credentials are missing
- Naming
    - `*.test.ts` for unit tests
    - `*.spec.ts` for e2e or integration tests (require running DEV server)
    - `*.fixture.ts` for test helpers, mocks, worker fixtures
- Organization
    - Top-level `test(...)` calls are OK; use `describe(...)` to group related tests when grouping helps, nesting allowed and preferred
- Set timeouts on describe blocks or individual tests for slow tests to make them visible
- Prefer to use `vi.fn()` or `jest.fn()` to create mock functions
- Mock entire test-specific class implementations via `class Testable extend ClassToBeTested {}`
    - Mock class methods/values or wrap originals in mocks for visibility
- Create helper/factory functions for repeated setup, keep tests DRY
- Prefer tests to be logic-free
- Write a test because it catches a regression, NEVER so that spec text counts as covered
