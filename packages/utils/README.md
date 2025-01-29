# Installation

```bash
$ npm install @kirill.konshin/utils
```

```ts
// moduleResoliution: nodenext
import { createWindow } from '@kirill.konshin/utils/electron';

// moduleResoliution: node
import { createWindow } from '@kirill.konshin/utils/dist/electron';
```

# Building

https://jakeginnivan.medium.com/options-for-publishing-typescript-libraries-9c37bec28fe

```
  'yarn build:bare': '4.7',
  'yarn build:vite': '4.0',
  'yarn build:rollup': '4.0',
  'yarn build:tsup': '10.1',
  'yarn build:unbuild': '4.5'
```

- `tsup`
    - slow
    - ✅ Minimal config
- `swc` + `tsc`
    - ❌ A bit slower than rollup/vite
    - ⚠️ Lots of configs
- `rollup+swc`
    - ⚠️ Quirks with watch mode
    - ⚠️ Seem to reemit all files all the time
- `vite`
    - ✅ Fast
    - ✅ Comes with `vitest`
    - ⚠️ Based on Rollup
    - ⚠️ Awkward configuration, half Vite half Rollup
- `unbuild`
    - ❌ Slower than vite/rollup+swc
    - ⚠️ Based on Rollup
    - ✅ Minimal config
- `bun`
    - ❌ DTS is slow
    - ❌ Build failed
    - ❌ Does not work as standalone bundler
- `turbopack`
    - ❌ Not yet available outside Next.js https://turbo.build/pack/docs#quickstart
- https://qwik.dev/
- https://tsdx.io/ Jared Palmer, I know him
    - ❌ Dead project
