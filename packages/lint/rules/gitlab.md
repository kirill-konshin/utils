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
- Keep local build-cache keys job-specific in parallel pipelines; a remote Nx or Turbo cache is needed only to share results between different jobs.
- With Nx Cloud (`nxCloudId` in `nx.json`): no `.nx` cache; `NX_CLOUD_ACCESS_TOKEN` is a masked **protected** CI/CD variable holding a read-write token (protected branches only), and merge-request pipelines map `NX_CLOUD_ACCESS_TOKEN: $NX_CLOUD_ACCESS_TOKEN_READ_ONLY` from a masked unprotected variable; see `lint-gitlab` skill.
- Without Nx Cloud, when caching Nx locally, cache its DB as `.nx/workspace-data/default-v*.db` next to `.nx/cache`: rename it to the runner's machine ID in `before_script` (before install) and back to `default-v*.db` in `after_script`, otherwise Nx ignores the restored `.nx/cache` (see `lint-gitlab` skill).
