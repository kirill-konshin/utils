---
type: always_apply # or agent_requested
description: Set of rules for projects which use Expo # Required for agent_requested
---

# CI Builds

```yml
variables:
    USE_HARD_LINKS: 'false' # https://github.com/electron-userland/electron-builder/issues/3179#issuecomment-408347702

build:
    image: macos-12-xcode-13
    tags:
        - shared-macos-amd64
    script:
        - yarn --immutable
        - yarn build # maybe add lint step so Vercel does not run it
        - rm -rf electron/dist/mac # some cleanup to make artifacts leaner
    only:
        - master
    artifacts:
        paths:
            - electron/dist
```
