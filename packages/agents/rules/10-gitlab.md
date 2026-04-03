---
type: always_apply # or agent_requested
description: Github patterns # Required for agent_requested
---

_EVERY_ Gitlab pipeline must adhere to policy unless explicitly prohibited in comment before the action or workflow definition.

# NodeJS Publish

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
