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
- Yarn cache: follow npm-yarn.md "Install on CI". Key it per branch, with the default branch as the fallback key.
- The fallback to the default-branch cache works only when "Use separate caches for protected branches" is cleared (Settings > CI/CD > General pipelines). Otherwise GitLab adds `-protected` or `-non_protected` to all keys, and other branches never find the default-branch cache. GitLab: clear it only when all users with the Developer role are highly trusted.
- With an `install` job, only this job has Yarn cache `policy: pull-push`. The other jobs use `policy: pull`. See the `lint-gitlab` skill.
- Use the fastzip archiver for cache and artifacts. It is the default from GitLab Runner 19.4. On older runners, set `FF_USE_FASTZIP: 'true'`.
- Set `CACHE_COMPRESSION_LEVEL: fastest` to pack and unpack the cache faster. This setting works only with fastzip.
- Keep local build-cache keys job-specific in parallel pipelines; a remote Nx or Turbo cache is needed only to share results between different jobs.
- With Nx Cloud (`nxCloudId` in `nx.json`): no `.nx` cache; `NX_CLOUD_ACCESS_TOKEN` is a masked **protected** CI/CD variable holding a read-write token (protected branches only), and merge-request pipelines map `NX_CLOUD_ACCESS_TOKEN: $NX_CLOUD_ACCESS_TOKEN_READ_ONLY` from a masked unprotected variable; see `lint-gitlab` skill.
- Without Nx Cloud, when caching Nx locally, cache its DB as `.nx/workspace-data/default-v*.db` next to `.nx/cache`: rename it to the runner's machine ID in `before_script` (before install) and back to `default-v*.db` in `after_script`, otherwise Nx ignores the restored `.nx/cache` (see `lint-gitlab` skill).
