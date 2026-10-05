---
type: always_apply
description: Set of rules for projects which use Gitlab
paths:
    - '**/.gitlab-ci.yml'
    - '**/.gitlab/**/*.yml'
    - '**/.gitlab/**/*.yaml'
---

- Always collect coverage from tests
- Always publish important build stats as artifacts
- Agentic review MUST verify this effective CI order: checkout and cache restore -> enable Corepack -> immutable install -> prepare -> verification (lint/test/build) -> publish; publishing MUST depend on successful verification.
- Keep local build-cache keys job-specific in parallel pipelines; use a remote Nx or Turbo cache when results must be shared across jobs.

# Example

- Use Nx Cloud or Turbo Remote Cache when build results must be shared safely across parallel jobs.
