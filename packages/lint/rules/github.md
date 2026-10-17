---
type: always_apply
description: Set of rules for projects which use Github
paths:
    - '**/.github/*.yml'
    - '**/.github/**/*.yml'
    - '**/.github/**/*.yaml'
---

- Agentic review MUST verify this effective CI order: checkout -> enable Corepack -> setup Node with Yarn cache -> restore build caches -> immutable install -> prepare -> verification (lint/test/build) -> publish; publishing MUST depend on successful verification.
- Key build caches per commit when jobs run one after another: key `${{ runner.os }}-<tool>-${{ github.sha }}`, restore key `${{ runner.os }}-<tool>-`. A later job gets an exact hit and does not save again.
- Key build caches per job and commit when jobs run in parallel: key `${{ runner.os }}-<tool>-${{ github.job }}-${{ github.sha }}`, restore key `${{ runner.os }}-<tool>-${{ github.job }}-`. Only the first job that saves a key keeps its outputs. A downstream job restores the producing job's key and does not save.
- When caching Nx locally, cache its DB as `.nx/workspace-data/default-v*.db` next to `.nx/cache`: rename it to the runner's machine ID before install and back to `default-v*.db` before an explicit `actions/cache/save`, otherwise Nx ignores the restored `.nx/cache` (see `lint-github` skill).
