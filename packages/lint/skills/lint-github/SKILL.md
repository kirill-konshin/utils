---
name: lint-github
description: Describes how to work with Github & example workflow as a reference which essential jobs and concepts usual Github Workflow should have
---

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

            - name: Enable Corepack
              run: corepack enable

            - name: Setup Node.js
              uses: actions/setup-node@v6
              with:
                  node-version: 24
                  registry-url: 'https://registry.npmjs.org'
                  cache: yarn
                  cache-dependency-path: yarn.lock

            #TODO https://turbo.build/repo/docs/guides/ci-vendors/github-actions#remote-caching
            #TODO https://turborepo.dev/docs/guides/ci-vendors/github-actions#remote-caching-with-github-actionscache
            - name: Cache Turbo
              uses: actions/cache@v6
              with:
                  path: .turbo
                  key: ${{ runner.os }}-turbo-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.job }}
                  restore-keys: |
                      ${{ runner.os }}-turbo-${{ github.run_id }}-${{ github.run_attempt }}-
                      ${{ runner.os }}-turbo-

            - name: Cache Nx
              uses: actions/cache@v6
              with:
                  path: .nx/cache
                  key: ${{ runner.os }}-nx-${{ github.run_id }}-${{ github.run_attempt }}-${{ github.job }}
                  restore-keys: |
                      ${{ runner.os }}-nx-${{ github.run_id }}-${{ github.run_attempt }}-
                      ${{ runner.os }}-nx-

            - name: Install dependencies
              run: yarn install --immutable

            # Add this if Yarn 2+ is used and package is NOT private, otherwise postinstall should be configured, and this block skipped
            - name: Prepare
              run: yarn prepare
```
