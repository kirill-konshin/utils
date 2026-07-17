---
type: always_apply # or agent_requested
description: Set of rules for projects which use Gitlab # Required for agent_requested
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
