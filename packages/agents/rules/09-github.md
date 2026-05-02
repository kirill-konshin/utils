---
type: always_apply # or agent_requested
description: Github patterns # Required for agent_requested
---

_EVERY_ Github action or workflow must adhere to policy unless explicitly prohibited in comment before the action or workflow definition.

# Release workflow

```yml
name: Release

on:
    push:
        branches:
            - main

permissions:
    id-token: write # Required for OIDC
    contents: read

concurrency: ${{ github.workflow }}-${{ github.ref }}

jobs:
    release:
        name: Release
        runs-on: ubuntu-latest
        env:
            TURBO_CACHE_DIR: .turbo

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
                  node-version: 24
                  registry-url: 'https://registry.npmjs.org'
                  cache: yarn
                  cache-dependency-path: yarn.lock

            - name: Enable Corepack
              run: corepack enable

            - name: Install dependencies
              run: yarn install --immutable

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
