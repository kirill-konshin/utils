---
type: always_apply
description: Set of rules for projects which use Github
paths:
    - '**/.github/*.yml'
---

# Example Workflow

```yml
name: Release

on:
    push:
        branches:
            - main

# If project publishes to NPM
permissions:
    id-token: write # Required for OIDC
    contents: read

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
    release:
        name: Release
        runs-on: ubuntu-latest
        env:
            TURBO_CACHE_DIR: .turbo # if project uses Turbo
            YARN_ENABLE_GLOBAL_CACHE: false # so that .yarn/cache is written

        # If project publishes to NPM
        # https://davistobias.com/articles/adding-changeset/#2.1.b-adding-changeset-to-github-workflows
        if: github.repository == 'kirill-konshin/utils'
        permissions:
            id-token: write # Required for OIDC trusted publishing
            contents: write
            pull-requests: write

        steps:
            - name: Checkout Repo
              uses: actions/checkout@v4

            - name: Setup Node.js
              uses: actions/setup-node@v6
              with:
                  node-version: 26
                  registry-url: 'https://registry.npmjs.org'
                  cache: yarn
                  cache-dependency-path: yarn.lock

            - name: Enable Corepack
              run: corepack enable

            - name: Get yarn cache directory path
              id: yarn-cache-dir-path
              run: echo "dir=$(yarn config get cacheFolder)" >> $GITHUB_OUTPUT

            - uses: actions/cache@v6
              id: yarn-cache # use this to check for `cache-hit` (`steps.yarn-cache.outputs.cache-hit != 'true'`)
              with:
                  path: ${{ steps.yarn-cache-dir-path.outputs.dir }}
                  key: ${{ runner.os }}-yarn-${{ hashFiles('**/yarn.lock') }}
                  restore-keys: |
                      ${{ runner.os }}-yarn-

            #TODO https://turbo.build/repo/docs/guides/ci-vendors/github-actions#remote-caching
            #TODO https://turborepo.dev/docs/guides/ci-vendors/github-actions#remote-caching-with-github-actionscache
            - name: Cache Turbo
              uses: actions/cache@v6
              with:
                  path: .turbo
                  key: ${{ runner.os }}-turbo-${{ github.sha }}
                  restore-keys: |
                      ${{ runner.os }}-turbo-

            - name: Cache NX
              uses: actions/cache@v6
              with:
                  path: .nx
                  key: ${{ runner.os }}-turbo-${{ github.sha }}
                  restore-keys: |
                      ${{ runner.os }}-turbo-

            - name: Install dependencies
              run: yarn install --immutable

            # Add this if Yarn 2+ is used and package is NOT private, otherwise postinstall should be configured, and this block skipped
            - name: Prepare
              run: yarn prepare
```
