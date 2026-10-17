---
name: lint-gitlab
description: Describes how to work with Gitlab Pipelines & example pipeline as a reference which essential jobs and concepts usual Gitlab project should have
---

# With Nx Cloud (`nxCloudId` in `nx.json`)

The remote cache replaces the local Nx cache. Take the pipeline below without the `.nx/cache` and `.nx/workspace-data/default-v*.db` cache paths and without the Nx DB steps in `before_script` / `after_script`.

- Nx Cloud workspace settings: Workspace visibility → Organization members only (pipelines without a token run without the cache); create two CI access tokens, read-write and read-only
- CI/CD variables, masked: `NX_CLOUD_ACCESS_TOKEN` (read-write, **protected** — protected branches only), `NX_CLOUD_ACCESS_TOKEN_READ_ONLY` (not protected)
- Developers: `npx nx login` once per machine

```yml
workflow:
    rules:
        # merge requests read the remote cache only
        - if: $CI_PIPELINE_SOURCE == 'merge_request_event'
          variables:
              NX_CLOUD_ACCESS_TOKEN: $NX_CLOUD_ACCESS_TOKEN_READ_ONLY
        - when: always
```

# Without Nx Cloud

```yml
image: node:lts

variables:
    YARN_ENABLE_GLOBAL_CACHE: false # so that .yarn/cache is written

cache:
    - key:
          prefix: yarn
          files:
              - yarn.lock # dependencies cached based on lockfile
      paths:
          - .yarn/cache
      policy: pull-push
    # Job-specific keys prevent parallel jobs from replacing each other's local build cache.
    - key: build-$CI_JOB_NAME_SLUG-$CI_COMMIT_REF_SLUG
      fallback_keys:
          - build-$CI_JOB_NAME_SLUG-$CI_DEFAULT_BRANCH
      paths:
          - .turbo
          - .nx/cache
          - .nx/workspace-data/default-v*.db # Nx indexes .nx/cache in a SQLite DB, cached under this fixed name
          - '**/.tscache'
          - '**/.tsbuildinfo'
          - '**/.next/cache'
      policy: pull-push

stages:
    - install
    - test
    - build

# separate so that cache can pre-populate if other steps would fail, it speeds things up
before_script:
    - corepack enable
    # Nx names the DB after the machine ID and ignores outputs it has no DB records for.
    # Give the DB this runner's ID before install (postinstall may run Nx).
    - |
        d=.nx/workspace-data
        id=$(cat /var/lib/dbus/machine-id 2>/dev/null || cat /etc/machine-id 2>/dev/null || echo machine)
        db=$(ls $d/default-v*.db 2>/dev/null | head -n 1 || true)
        if [ -z "$db" ]; then
          rm -rf .nx/cache # outputs without their DB are unusable
        else
          to=$d/$id-v${db##*-v}
          rm -f "$to" "$to-wal" "$to-shm"
          mv "$db" "$to"
        fi
        echo "Nx cache DB for machine ID $id: $(ls $d/*.db 2>/dev/null || echo none)"
    - yarn install --immutable
    - yarn prepare # Add this if Yarn 2+ is used and package is NOT private, otherwise postinstall should be configured, and this line skipped

# GitLab saves the cache after after_script: store the DB under the fixed name the cache holds
after_script:
    - |
        d=.nx/workspace-data
        db=$(ls -t $d/*-v*.db 2>/dev/null | head -n 1 || true)
        to=$d/default-v${db##*-v}
        [ -z "$db" ] || [ "$db" = "$to" ] || mv -f "$db" "$to"
        echo "Nx cache DB to save: $(ls $d/default-v*.db 2>/dev/null || echo none)"

install:
    stage: install
    script:
        - echo Done

lint:
    stage: test
    script:
        - yarn vp check # Vite+: format + lint + type checks, no --fix; without Vite+: yarn lint

test:
    stage: test
    image: mcr.microsoft.com/playwright:v1.50.0-noble # keep in sync with installed Playwright version
    artifacts:
        when: always
        paths:
            - test-results
            - test-results-html
        reports:
            junit: test-results/junit.xml
    script:
        - yarn test:playwright # https://playwright.dev/docs/ci#running-headed xvfb-run yarn test:playwright

# Not needed for Vercel-hosted projects
build:
    stage: build
    script:
        - yarn build
    only:
        - master
    artifacts:
        paths:
            - web/build
```
