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

            - name: Install dependencies
              run: yarn install --immutable

            # Yarn Berry never runs the top-level `prepare` script on install — run it explicitly.
            # Without it the Nx project graph cache is missing and @nx/eslint-plugin rules silently skip.
            # ONLY ADD IF NX IS PRESENT OR OTHER NEED EXISTS, LIKE AGENTS PKG VERIFICATIONS ON CI
            - name: Prepare
              run: yarn prepare

              #TODO https://turbo.build/repo/docs/guides/ci-vendors/github-actions#remote-caching
            #TODO https://turborepo.dev/docs/guides/ci-vendors/github-actions#remote-caching-with-github-actionscache
            - name: Cache turbo build setup
              uses: actions/cache@v4
              with:
                  path: .turbo
                  key: ${{ runner.os }}-turbo-${{ github.sha }}
                  restore-keys: |
                      ${{ runner.os }}-turbo-
```
