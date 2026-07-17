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
        - yarn build
    only:
        - master
    artifacts:
        paths:
            - web/build
```
