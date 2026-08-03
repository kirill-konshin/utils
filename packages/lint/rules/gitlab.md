---
type: always_apply
description: Set of rules for projects which use Gitlab
paths:
    - '**/.gitlab-ci.yml'
---

- Always collect coverage from tests
- Always publish important build stats as artifacts

# Example

```yml
image: node:lts

variables:
    YARN_ENABLE_GLOBAL_CACHE: false # so that .yarn/cache is written

cache:
    - key:
          files:
              - yarn.lock # dependencies cached based on lockfile
      paths:
          - .yarn
          - .pnp.js
          - yarn.lock
          - node_modules
          - '**/node_modules'
    - key: $CI_COMMIT_REF_NAME # build-related files cached per-branch
      paths:
          - '**/.turbo'
          - '**/.nx'
          - '**/.tscache'
          - '**/.tsbuildinfo'
          - '**/.next/cache'

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

Cache `.yarn` individually is possible but not needed:

```yaml
- .yarn/cache
- .yarn/unplugged
- .yarn/build-state.yml
- .yarn/install-state.gz
```
