---
name: lint-electron
description: Skill for Electron-based apps - dev runner that restarts Electron (vp pack --watch), packaging a Next.js standalone server with electron-builder in a hoisted monorepo, CI builds. Use when setting up, running or packaging an Electron app.
---

# Dev Runner

ALWAYS run the main process in development with `vp pack --watch` (Vite+, tsdown), never `tsc-watch`, `nodemon` or `electron .` alone: it rebuilds the entrypoint and restarts Electron through `onSuccess` (tsdown stops the previous process). Files outside the main process module graph that need a restart (`next.config.*`: Next.js applies config only on a restart, like `next dev`; a linked library build) go in through a plugin — the `watch` option cannot list them, `--watch` overrides it with `true`:

```ts
import path from 'node:path';

import { defineConfig } from 'vite-plus';

const isWatch = process.argv.includes('--watch');

// absolute: Rolldown's `addWatchFile` takes them as is
const restartOn = ['next.config.ts'].map((file) => path.resolve(import.meta.dirname, file));

export default defineConfig({
    pack: {
        entry: ['src-electron/index.ts'],
        outDir: 'build',
        format: 'esm',
        platform: 'node',
        fixedExtension: false,
        dts: false,
        deps: { neverBundle: true },
        tsconfig: 'tsconfig-electron.json',
        ...(isWatch && {
            plugins: [
                {
                    name: 'restart-on',
                    buildStart() {
                        for (const file of restartOn) this.addWatchFile(file);
                    },
                },
            ],
            onSuccess: 'cross-env NODE_ENV=development electron .',
        }),
    },
});
```

Scripts: `"start": "vp pack --watch"`, `"build:main": "vp pack"`.

# Packaging a Next.js Standalone Server

In a hoisted workspace (see npm-yarn rule) Next.js traces the server's dependencies into `.next/standalone/node_modules`, beside the app folder; package both, without Electron:

```yaml
files:
    - build
    - '.next/standalone/<app>/**/*'
    - '.next/standalone/node_modules/**/*'
    - '!.next/standalone/node_modules/electron'
```

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
