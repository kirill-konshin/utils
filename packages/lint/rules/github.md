---
type: always_apply
description: Set of rules for projects which use Github
paths:
    - '**/.github/*.yml'
    - '**/.github/**/*.yml'
    - '**/.github/**/*.yaml'
---

- Agentic review MUST verify this effective CI order: checkout -> enable Corepack -> setup Node with Yarn cache -> restore build caches -> immutable install -> prepare -> verification (lint/test/build) -> publish; publishing MUST depend on successful verification.
- In multi-job workflows, use job-specific build-cache keys with a same-run fallback so downstream jobs reuse upstream results without immutable-key collisions.
