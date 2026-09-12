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
    - yarn install --immutable
    - yarn prepare # Add this if Yarn 2+ is used and package is NOT private, otherwise postinstall should be configured, and this line skipped

install:
    stage: install
    script:
        - echo Done

lint:
    stage: test
    script:
        - yarn lint

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

- Use Nx Cloud or Turbo Remote Cache when build results must be shared safely across parallel jobs.
