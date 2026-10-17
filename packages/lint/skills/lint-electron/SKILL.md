---
name: lint-electron
description: Skill for Electron-based apps
---

# CI Builds

## Gitlab

```yml
variables:
    USE_HARD_LINKS: 'false' # https://github.com/electron-userland/electron-builder/issues/3179#issuecomment-408347702

build:
    image: macos-12-xcode-13 # not exact version, but the point is to use macos-compatible image
    tags:
        - shared-macos-amd64
    script:
        - yarn --immutable
        - yarn build
        - rm -rf electron/dist/mac # some cleanup to make artifacts leaner
    only:
        - master
    artifacts:
        paths:
            - electron/dist
```
