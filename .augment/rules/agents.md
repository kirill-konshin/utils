# Agent Rules

General agent rules are provided by `@kirill.konshin/agents` package.
See: `packages/agents/rules/01-agents.md`

# Build and Test Verification (Repo-Specific)

ALWAYS verify that the package builds successfully and tests pass after making changes:

1. Run the package build: `yarn turbo run build --filter=@kirill.konshin/<package-name>`
2. Run the package tests: `yarn turbo run test --filter=@kirill.konshin/<package-name>`
3. You may use grep or similar filtering (e.g., `vitest run -t "pattern"`) to limit tests when you are confident the filter covers all relevant tests
4. If in doubt about test coverage, the final verification step should be to run all tests in the affected package

Do not consider work complete until build and tests pass.
