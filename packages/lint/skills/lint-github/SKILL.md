---
name: lint-github
description: Describes how to work with Github & example workflow as a reference which essential jobs and concepts usual Github Workflow should have
---

Reference CI: two local composite actions and a workflow. Install and cache rules: npm-yarn.md "Install on CI" and github.md.

- The `install` job fills the Yarn cache (`setup` with `yarn-cache: warm`).
- The checks run after it as parallel jobs. They only restore the cache (`yarn-cache: restore`).
- The publish job needs all checks.
- A workflow with one job, or with jobs that run one after another, has no `install` job. It uses the default `yarn-cache: save`.
- Self-hosted runners with a shared cache volume: remove the `Use local Yarn cache` step and the Yarn cache steps from `setup` (npm-yarn.md "Install on CI").

# With Nx Cloud (`nxCloudId` in `nx.json`)

The remote cache replaces the local Nx cache. Take the templates below without the `nx-cache` action: no `Restore Nx cache` step and `nx-cache` input in `setup`, no `Save Nx cache` steps and `nx-cache:` inputs in workflows.

- Nx Cloud workspace settings: Workspace visibility → Organization members only (fork PRs run without the cache); create two CI access tokens, read-write and read-only
- GitHub **repository** secrets — environment secrets reach only jobs that declare the environment, and every Nx job needs the token: `NX_CLOUD_ACCESS_TOKEN` (read-write), `NX_CLOUD_ACCESS_TOKEN_READ_ONLY`
- Developers: `npx nx login` once per machine

Workflow running only on `main` (release):

```yml
env:
    NX_CLOUD_ACCESS_TOKEN: ${{ secrets.NX_CLOUD_ACCESS_TOKEN }}
```

PR workflow (fork PRs get no secrets and run without the cache):

```yml
env:
    NX_CLOUD_ACCESS_TOKEN: ${{ secrets.NX_CLOUD_ACCESS_TOKEN_READ_ONLY }}
```

# Without Nx Cloud

`.github/actions/nx-cache/action.yml` — Nx 20+ ignores a restored `.nx/cache` without its DB:

```yml
name: Nx cache
description: Caches .nx/cache with the Nx DB under the fixed name default-v*.db. Restore runs before install (./.github/actions/setup does it); save is the last step of a job that keeps its Nx outputs.

inputs:
    mode:
        description: restore | save
        required: false
        default: restore
    job:
        description: Job whose cache to use (defaults to this job); save only your own job's cache, parallel jobs must not share a key
        required: false
        default: ''

runs:
    using: composite
    steps:
        - name: Check mode
          if: inputs.mode != 'restore' && inputs.mode != 'save'
          shell: bash
          run: echo "::error::nx-cache mode must be restore or save, got '${{ inputs.mode }}'" && exit 1

        # Nx indexes .nx/cache in a SQLite DB, cached next to it as default-v*.db.
        # One key per job and commit: parallel jobs never race for a key.
        - name: Restore Nx cache
          if: inputs.mode == 'restore'
          uses: actions/cache/restore@v6
          with:
              path: |
                  .nx/cache
                  .nx/workspace-data/default-v*.db
              key: ${{ runner.os }}-nx-${{ inputs.job || github.job }}-${{ github.sha }}
              restore-keys: |
                  ${{ runner.os }}-nx-${{ inputs.job || github.job }}-
                  ${{ runner.os }}-nx-

        # Nx names the DB after the machine ID and ignores outputs it has no DB records for.
        # Give the DB this runner's ID before install (postinstall runs Nx).
        - name: Adopt Nx cache DB
          if: inputs.mode == 'restore'
          shell: bash
          run: |
              d=.nx/workspace-data
              id=$(cat /var/lib/dbus/machine-id 2>/dev/null || cat /etc/machine-id 2>/dev/null || echo machine)
              db=$(ls $d/default-v*.db 2>/dev/null | head -n 1 || true)
              if [ -z "$db" ]; then
                rm -rf .nx/cache # outputs without their DB are unusable
              else
                to=$d/$id-v${db##*-v}
                rm -f "$to" "$to-wal" "$to-shm"
                mv "$db" "$to"
              fi
              echo "Nx cache DB for machine ID $id: $(ls $d/*.db 2>/dev/null || echo none)"

        # After the last Nx step: store the DB under the fixed name the cache holds
        - name: Store Nx cache DB
          if: inputs.mode == 'save'
          shell: bash
          run: |
              d=.nx/workspace-data
              db=$(ls -t $d/*-v*.db 2>/dev/null | head -n 1 || true)
              to=$d/default-v${db##*-v}
              [ -z "$db" ] || [ "$db" = "$to" ] || mv -f "$db" "$to"
              echo "Nx cache DB to save: $(ls $d/default-v*.db 2>/dev/null || echo none)"

        - name: Save Nx cache
          if: inputs.mode == 'save'
          uses: actions/cache/save@v6
          with:
              path: |
                  .nx/cache
                  .nx/workspace-data/default-v*.db
              key: ${{ runner.os }}-nx-${{ inputs.job || github.job }}-${{ github.sha }}
```

`.github/actions/setup/action.yml`:

```yml
name: Setup
description: Node.js + Corepack + build cache restore + Yarn install. The repo must already be checked out (a local action cannot run before checkout). Jobs that keep their Nx outputs end with ./.github/actions/nx-cache (mode save).

inputs:
    registry-url:
        description: npm registry URL — set only on jobs that publish (configures .npmrc auth)
        required: false
        default: ''
    nx-cache:
        description: Job whose Nx cache to restore (defaults to this job); a job that does not save reuses another job's cache
        required: false
        default: ''
    yarn-cache:
        description: 'save: restore, install, save on a miss. warm: the install job, fills and saves the cache, does not install. restore: a job after the install job, restores only.'
        required: false
        default: save

runs:
    using: composite
    steps:
        - name: Check yarn-cache
          if: inputs.yarn-cache != 'save' && inputs.yarn-cache != 'warm' && inputs.yarn-cache != 'restore'
          shell: bash
          run: echo "::error::yarn-cache must be save, warm or restore, got '${{ inputs.yarn-cache }}'" && exit 1

        # All packages go to .yarn/cache, the folder that CI caches (npm-yarn.md "Install on CI")
        - name: Use local Yarn cache
          run: echo "YARN_ENABLE_GLOBAL_CACHE=false" >> "$GITHUB_ENV"
          shell: bash

        - name: Enable Corepack
          run: corepack enable
          shell: bash

        - name: Setup Node.js
          uses: actions/setup-node@v6
          with:
              node-version: 24
              registry-url: ${{ inputs.registry-url }}

        - name: Look up Yarn cache
          id: lookup
          if: inputs.yarn-cache == 'warm'
          uses: actions/cache/restore@v6
          with:
              path: .yarn/cache
              key: ${{ runner.os }}-yarn-${{ hashFiles('yarn.lock') }}
              lookup-only: true

        # An older cache is safe: install fetches only the missing packages
        - name: Restore Yarn cache
          id: restore
          if: steps.lookup.outputs.cache-hit != 'true'
          uses: actions/cache/restore@v6
          with:
              path: .yarn/cache
              key: ${{ runner.os }}-yarn-${{ hashFiles('yarn.lock') }}
              restore-keys: |
                  ${{ runner.os }}-yarn-

        # The install job only fills the Yarn cache: no build caches, no install, no prepare
        - name: Fetch dependencies
          if: inputs.yarn-cache == 'warm' && steps.lookup.outputs.cache-hit != 'true'
          run: yarn install --immutable --mode=skip-build
          shell: bash

        # If project uses Turbo
        #TODO https://turbo.build/repo/docs/guides/ci-vendors/github-actions#remote-caching
        #TODO https://turborepo.dev/docs/guides/ci-vendors/github-actions#remote-caching-with-github-actionscache
        # One entry per commit when jobs run one after another; for parallel jobs add ${{ github.job }} to key and restore key (only the first job that saves a key keeps its outputs)
        - name: Cache Turbo
          if: inputs.yarn-cache != 'warm'
          uses: actions/cache@v6
          with:
              path: .turbo
              key: ${{ runner.os }}-turbo-${{ github.job }}-${{ github.sha }}
              restore-keys: |
                  ${{ runner.os }}-turbo-${{ github.job }}-
                  ${{ runner.os }}-turbo-

        # If project uses Nx
        - name: Restore Nx cache
          if: inputs.yarn-cache != 'warm'
          uses: ./.github/actions/nx-cache
          with:
              job: ${{ inputs.nx-cache }}

        - name: Install dependencies
          if: inputs.yarn-cache != 'warm'
          run: yarn install --immutable
          shell: bash

        # Directly after install: a failed check later does not stop the save
        - name: Save Yarn cache
          if: inputs.yarn-cache != 'restore' && steps.lookup.outputs.cache-hit != 'true' && steps.restore.outputs.cache-hit != 'true'
          uses: actions/cache/save@v6
          with:
              path: .yarn/cache
              key: ${{ runner.os }}-yarn-${{ hashFiles('yarn.lock') }}

        # Add this if Yarn 2+ is used and package is NOT private, otherwise postinstall should be configured, and this block skipped
        - name: Prepare
          if: inputs.yarn-cache != 'warm'
          run: yarn prepare
          shell: bash
```

`.github/workflows/release.yml`:

```yml
name: Release

on:
    push:
        branches:
            - main

permissions:
    contents: read

concurrency: ${{ github.workflow }}-${{ github.ref }}

env:
    TURBO_CACHE_DIR: .turbo # if project uses Turbo

# The checks run as parallel jobs after install. They only restore the Yarn cache. Release needs all checks.
# Only jobs with their own Nx cache save it.
jobs:
    install:
        name: Install
        runs-on: ubuntu-latest

        steps:
            - name: Checkout Repo
              uses: actions/checkout@v7

            - name: Setup
              uses: ./.github/actions/setup
              with:
                  yarn-cache: warm

    lint:
        name: Lint
        runs-on: ubuntu-latest
        # type checks read the built declarations; after the build job its build is all cache hits
        needs: build

        steps:
            - name: Checkout Repo
              uses: actions/checkout@v7

            - name: Setup
              uses: ./.github/actions/setup
              with:
                  nx-cache: build # reuses the build job's cache; this job does not save
                  yarn-cache: restore

            # type checks read the built declarations of workspace packages
            - name: Build packages
              run: yarn build # the orchestrator, cache hits

            - name: Lint
              run: yarn vp check # Vite+: format + lint + type checks, no --fix; without Vite+: yarn lint

    test:
        name: Test
        runs-on: ubuntu-latest
        needs: install

        steps:
            - name: Checkout Repo
              uses: actions/checkout@v7

            - name: Setup
              uses: ./.github/actions/setup
              with:
                  yarn-cache: restore

            - name: Test
              run: yarn test

            - name: Save Nx cache
              uses: ./.github/actions/nx-cache
              with:
                  mode: save

    build:
        name: Build
        runs-on: ubuntu-latest
        needs: install

        steps:
            - name: Checkout Repo
              uses: actions/checkout@v7

            - name: Setup
              uses: ./.github/actions/setup
              with:
                  yarn-cache: restore

            - name: Build
              run: yarn build

            - name: Save Nx cache
              uses: ./.github/actions/nx-cache
              with:
                  mode: save

    release:
        name: Release
        runs-on: ubuntu-latest

        needs: [lint, test, build]

        # If project publishes to NPM
        # https://davistobias.com/articles/adding-changeset/#2.1.b-adding-changeset-to-github-workflows
        if: github.repository == 'kirill-konshin/utils'
        permissions:
            id-token: write # Required for OIDC trusted publishing
            contents: write
            pull-requests: write

        steps:
            - name: Checkout Repo
              uses: actions/checkout@v7

            - name: Setup
              uses: ./.github/actions/setup
              with:
                  registry-url: 'https://registry.npmjs.org' # publish job needs .npmrc auth config
                  nx-cache: build # exact key of the build job's cache; this job does not save
                  yarn-cache: restore

            # Different runner: outputs come from the build job's Nx cache, so nothing should rebuild
            - name: Build
              run: yarn build

            - name: Release
              run: yarn release # the project's publish command
```
