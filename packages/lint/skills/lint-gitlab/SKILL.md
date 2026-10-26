---
name: lint-gitlab
description: Reference GitLab CI pipeline - install / lint / test (coverage) / e2e / build jobs, Yarn, Nx and Vite+ task caches, Nx Cloud tokens, a shared cache volume. Use when writing, reviewing or debugging `.gitlab-ci.yml`.
---

# With Nx Cloud (`nxCloudId` in `nx.json`)

The remote cache replaces the local Nx cache. Take the pipeline below without the `.nx/cache` and `.nx/workspace-data/default-v*.db` cache paths and without the Nx DB steps in `before_script` / `after_script`.

- Nx Cloud workspace settings: Workspace visibility → Organization members only (pipelines without a token run without the cache); create two CI access tokens, read-write and read-only
- CI/CD variables, masked: `NX_CLOUD_ACCESS_TOKEN` (read-write, **protected** — protected branches only), `NX_CLOUD_ACCESS_TOKEN_READ_ONLY` (not protected)
- Developers: `npx nx login` once per machine

```yml
workflow:
    rules:
        # merge requests read the remote cache only
        - if: $CI_PIPELINE_SOURCE == 'merge_request_event'
          variables:
              NX_CLOUD_ACCESS_TOKEN: $NX_CLOUD_ACCESS_TOKEN_READ_ONLY
        - when: always
```

# Without Nx Cloud

```yml
image: node:lts

# Install and cache rules: npm-yarn.md "Install on CI" and gitlab.md
variables:
    YARN_ENABLE_GLOBAL_CACHE: false # all packages go to .yarn/cache, the folder that CI caches
    FF_USE_FASTZIP: 'true' # only for GitLab Runner < 19.4, where fastzip is not the default
    CACHE_COMPRESSION_LEVEL: fastest # packs and unpacks the cache faster; needs fastzip

# An older cache is safe: install fetches only the missing packages
.yarn-cache: &yarn-cache
    key: yarn-$CI_COMMIT_REF_SLUG
    fallback_keys:
        # Found only when "Use separate caches for protected branches" is cleared (gitlab.md)
        - yarn-$CI_DEFAULT_BRANCH
    paths:
        - .yarn/cache

cache:
    # Pull only: the install job uploads it. Without an install job, use pull-push.
    - <<: *yarn-cache
      policy: pull
    # Job-specific keys prevent parallel jobs from replacing each other's local build cache.
    - key: build-$CI_JOB_NAME_SLUG-$CI_COMMIT_REF_SLUG
      fallback_keys:
          - build-$CI_JOB_NAME_SLUG-$CI_DEFAULT_BRANCH
      paths:
          - .turbo
          - .nx/cache
          - .nx/workspace-data/default-v*.db # Nx indexes .nx/cache in a SQLite DB, cached under this fixed name
          - '**/.tscache'
          - '**/.tsbuildinfo'
          - '**/.next/cache'
          - node_modules/.vite/task-cache # Vite+ tasks (`vp run`): experimental, measure first (npm-yarn.md "Install on CI")
      policy: pull-push

stages:
    - install
    - test
    - build

# separate so that cache can pre-populate if other steps would fail, it speeds things up
before_script:
    - corepack enable
    # Nx names the DB after the machine ID and ignores outputs it has no DB records for.
    # Give the DB this runner's ID before install (postinstall may run Nx).
    - |
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
    - yarn install --immutable
    - yarn prepare # Add this if Yarn 2+ is used and package is NOT private, otherwise postinstall should be configured, and this line skipped

# GitLab saves the cache after after_script: store the DB under the fixed name the cache holds
after_script:
    - |
        d=.nx/workspace-data
        db=$(ls -t $d/*-v*.db 2>/dev/null | head -n 1 || true)
        to=$d/default-v${db##*-v}
        [ -z "$db" ] || [ "$db" = "$to" ] || mv -f "$db" "$to"
        echo "Nx cache DB to save: $(ls $d/default-v*.db 2>/dev/null || echo none)"

# Fills the Yarn cache before the parallel jobs start. It is the only job that uploads the Yarn cache.
# before_script does the install.
install:
    stage: install
    cache:
        - <<: *yarn-cache
          policy: pull-push
    script:
        - echo Done

lint:
    stage: test
    script:
        - yarn build # type checks read the built declarations of workspace packages; the orchestrator, cache hits
        - yarn vp check # Vite+: format + lint + type checks, no --fix; without Vite+: yarn lint

test:
    stage: test
    script:
        - yarn vp test run --coverage # Vite+; without Vite+: yarn test --coverage; the cobertura reporter writes the report below
    coverage: '/All files[^|]*\|[^|]*\s+([\d.]+)/' # line coverage % of the text reporter, shown in merge requests
    artifacts:
        when: always
        paths:
            - coverage
        reports:
            coverage_report:
                coverage_format: cobertura
                path: coverage/cobertura-coverage.xml

e2e:
    stage: test
    image: mcr.microsoft.com/playwright:v1.64.1-noble # keep in sync with the installed Playwright version
    artifacts:
        when: always
        paths:
            - test-results
            - test-results-html
        reports:
            junit: test-results/junit.xml
    script:
        - yarn test:playwright # https://playwright.dev/docs/ci#running-headed xvfb-run yarn test:playwright

# Not needed for Vercel-hosted projects
build:
    stage: build
    script:
        - yarn build
    rules:
        - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
    artifacts:
        paths:
            - web/build
```

# Shared Cache Volume

Use this when all runners mount the same volume (the `lint-npm-yarn` skill, "Install on CI"). The packages stay on the volume. No job uploads or downloads them.

Runner config (Kubernetes executor, a ReadWriteMany PVC):

```toml
[[runners.kubernetes.volumes.pvc]]
name = "cache-yarn"
mount_path = "/cache/yarn"
```

Pipeline changes:

- Remove the `.yarn-cache` entries.
- Set these variables. Keep the global folder and the store on this one volume: the `pnpm` linker cannot hardlink across filesystems.
- With `nodeLinker: node-modules`, remove the `install` job. With `nodeLinker: pnpm`, keep it without its `cache:` entry: it fills the branch store before the parallel jobs start.

```yml
variables:
    YARN_ENABLE_GLOBAL_CACHE: 'true' # explicit: a .yarnrc.yml can turn it off
    YARN_GLOBAL_FOLDER: /cache/yarn # global cache in /cache/yarn/cache, hardlink index in /cache/yarn/index
    YARN_PNPM_STORE_FOLDER: /cache/yarn/store/$CI_COMMIT_REF_SLUG # only with nodeLinker: pnpm; one store per branch
```

Clean the volume on a schedule (Build > Pipeline schedules, variable `CLEAR_CACHE: 'true'`). Run it at a quiet time: a job that installs during the cleanup can fail.

```yml
clear-cache:
    stage: .post
    rules:
        - if: $CI_PIPELINE_SOURCE == "schedule" && $CLEAR_CACHE == "true"
    cache: []
    before_script: [] # no install
    after_script: []
    script:
        - rm -rf /cache/yarn/store/* # stores of deleted branches; active branches refill from the index
        - rm -rf /cache/yarn/cache/* /cache/yarn/index/* # the global cache and the index only grow
```
