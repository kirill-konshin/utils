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
build:
    image: node:24
    cache:
        key:
            files:
                - yarn.lock
        paths:
            - .yarn/cache
            - yarn.lock
            - node_modules
            - '**/node_modules'
            - '**/.turbo'
            - '**/.tscache'
            - web/.next/cache
    script:
        - yarn --immutable
        - yarn prepare # Yarn 2+ does not run it and Nx needs it for graph, ONLY ADD IF NX IS PRESENT OR OTHER NEED EXISTS, LIKE AGENTS PKG VERIFICATIONS ON CI
        - yarn build
    only:
        - master
    artifacts:
        paths:
            - web/build
```
