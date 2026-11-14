---
name: lint-electron
description: Skill for Electron-based apps - packages to use (`@kirill.konshin/electron`, `@kirill.konshin/electron-builder`, `next-electron-rsc`), dev runner that restarts Electron (vp pack --watch), packaging a Next.js standalone server with electron-builder in a hoisted monorepo, CI builds. Use when setting up, running or packaging an Electron app.
---

# Packages

Use these packages before you write the same code:

- `@kirill.konshin/electron` — main-process helpers: `createWindow` (a window that loads the dev server, a static export or a remote URL; it remembers its bounds, adds the default menu, can check for updates) and `checkForUpdates` (`electron-updater` with dialogs, for a menu item)
- `@kirill.konshin/electron-builder` — `builerConfig()` for `electron-builder.ts`: DMG and zip targets (DMG only without signing), S3 and GitHub Releases publishing by CI ref, `assets` as build resources, `mac.icon` from `@kirill.konshin/app-images`; it keeps the app config you pass
- `next-electron-rsc` — runs a Next.js app with React Server Components and Server Actions in Electron, with no open port in production; install `next` as a dependency, not a devDependency: electron-builder copies only dependencies into the app

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

This is the `vite.config.ts` of the Electron app's own workspace package. When the app is the workspace root, the root `vite.config.ts` stays `defineConfig(vitePlusConfig())`: put the `pack` block under the `vitePlus` key of `lint.config.ts` (`vitePlus: { pack: { … } }`).

# Icons

App icons (macOS `.icns`, no Xcode needed; opt-in Icon Composer `.icon`), Windows and Linux icons, splash and DMG background: use `@kirill.konshin/app-images`, its `app-images` skill installs with it.

# Packaging a Next.js Standalone Server

In a hoisted workspace (see [rules/npm-yarn.md](../../rules/npm-yarn.md#hoisting)) Next.js traces the server's dependencies into `.next/standalone/node_modules`, beside the app folder; package both, without Electron:

```yaml
files:
    - build
    - '.next/standalone/<app>/**/*'
    - '.next/standalone/node_modules/**/*'
    - '!.next/standalone/node_modules/electron'
```

Keep `asar` on (the electron-builder default). The packaged app is read-only, so:

- Unpack native code by name: electron-builder unpacks it by itself only for dependencies, not for files that come in through `files`, such as the standalone `node_modules`

    ```yaml
    asarUnpack:
        - '**/*.node'
        - '**/node_modules/sharp/**'
        - '**/node_modules/@img/**'
    ```

- Next.js writes its ISR, fetch and image caches inside the app: `next-electron-rsc` keeps the ISR and fetch cache in memory and serves images as they are; `experimental_cacheDir` of `createHandler` moves them to Electron's `userData` folder
- If the dependency install of electron-builder fails while it builds `sharp` from source, set `npmRebuild: false`: the standalone folder has its own `node_modules`

# macOS Signing

Sign in ONE pass: a custom `mac.sign` (electron-builder 26) that calls `@electron/osx-sign` replaces electron-builder's own signing; never sign ad hoc first and again in `afterSign` (`afterSign` only runs when electron-builder signed itself). Keep `mac.identity` set (`-` is enough) so electron-builder runs the signing step that calls `sign`.

```ts
mac: {
    identity: '-',
    sign: ({ app }) =>
        sign({
            app,
            identity: '<certificate name>',
            batchCodesignCalls: true, // one codesign per argument group
            ignore: (file) => file.endsWith('.pak'), // sealed by Electron's framework
            optionsForFile: () => ({ timestamp: 'none' }), // ONLY without notarization
        }),
},
```

- osx-sign runs one `codesign` per binary-looking file, with an Apple timestamp request each; 223 of 245 files of an Electron app are `.pak`
- Measured (365 MB app): 84 s -> 25 s (batch + no timestamp) -> 10 s (+ skip `.pak`), `codesign --verify --deep --strict` still passes
- Notarized builds (Developer ID) need the timestamp: keep the default there and only batch and skip `.pak`

# CI Builds

## Gitlab

Base the pipeline on the `lint-gitlab` skill (Corepack, install, cache). The Electron build job adds:

```yml
variables:
    USE_HARD_LINKS: 'false' # https://github.com/electron-userland/electron-builder/issues/3179#issuecomment-408347702

build:
    image: <current GitLab macOS image> # a macOS runner builds and signs mac targets
    tags:
        - <macOS runner tag>
    script:
        - yarn build
        - rm -rf electron/dist/mac # some cleanup to make artifacts leaner
    rules:
        - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
    artifacts:
        paths:
            - electron/dist
```
