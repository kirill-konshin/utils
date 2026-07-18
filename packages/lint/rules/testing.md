---
type: always_apply
description: Set of rules for projects with tests
paths:
    - '**/jest.config.{ts,js,mjs,cjs}'
    - '**/vite.config.{ts,js,mjs,cjs}'
    - '**/*.test.ts'
    - '**/*.spec.ts'
    - '**/*.fixture.ts'
---

- If project use `vite` use `vitest`, otherwise `jest`
- If project needs browser-based testing use `playwright`
- Naming
    - `*.test.ts` for unit tests
    - `*.spec.ts` for e2e or integration tests (require running DEV server)
    - `*.fixture.ts` for test helpers, mocks, worker fixtures
- Organization
    - Use `describe(...)` to group related tests, nesting allowed and preferred
- Set timeouts on describe blocks or individual tests for slow tests to make them visible
- Prefer to use `vi.fn()` or `jest.fn()` to create mock functions
- Mock entire test-specific class implementations via `class Testable extend ClassToBeTested {}`
    - Mock class methods/values or wrap originals in mocks for visibility
- Create helper/factory functions for repeated setup, keep tests DRY
- Prefer tests to be logic-free
