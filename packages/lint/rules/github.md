---
type: always_apply
description: Set of rules for projects which use Github
paths:
    - '**/.github/*.yml'
    - '**/.github/**/*.yml'
    - '**/.github/**/*.yaml'
---

- Agentic review MUST verify this effective CI order: checkout -> enable Corepack -> setup Node -> restore Yarn cache -> restore build caches -> immutable install -> prepare -> verification (lint/test/build) -> publish; publishing MUST depend on successful verification.
- Yarn cache: follow [npm-yarn.md](npm-yarn.md#install-on-ci). Use the key `${{ runner.os }}-yarn-${{ hashFiles('yarn.lock') }}` and the restore key `${{ runner.os }}-yarn-`.
- With an `install` job, only this job saves the Yarn cache. The other jobs `need` it and restore with `actions/cache/restore`. See the `lint-github` skill.
- Key build caches per commit when jobs run one after another: key `${{ runner.os }}-<tool>-${{ github.sha }}`, restore key `${{ runner.os }}-<tool>-`. A later job gets an exact hit and does not save again.
- Key build caches per job and commit when jobs run in parallel: key `${{ runner.os }}-<tool>-${{ github.job }}-${{ github.sha }}`, restore key `${{ runner.os }}-<tool>-${{ github.job }}-`. Only the first job that saves a key keeps its outputs. A downstream job restores the producing job's key and does not save.
- With Nx Cloud (`nxCloudId` in `nx.json`): no `.nx` cache steps; workflow-level `env: NX_CLOUD_ACCESS_TOKEN` — `${{ secrets.NX_CLOUD_ACCESS_TOKEN }}` (read-write) in workflows that run only on `main`, `${{ secrets.NX_CLOUD_ACCESS_TOKEN_READ_ONLY }}` in PR workflows, both repository secrets (fork PRs get no secrets and run without the cache); see `lint-github` skill.
- Without Nx Cloud, when caching Nx locally, cache its DB as `.nx/workspace-data/default-v*.db` next to `.nx/cache`: rename it to the runner's machine ID before install and back to `default-v*.db` before an explicit `actions/cache/save`, otherwise Nx ignores the restored `.nx/cache` (see `lint-github` skill).
