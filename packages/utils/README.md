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

```bash
python3 -m timeit -n 1 -r 10 -s 'import os' 'os.system("yarn build:rollup")'
TIMEFORMAT='%R'; for i in {1..5}; do time yarn build:rollup; done | awk '{sum+=$1} END {print "Average time:", sum/NR, "sec"}'
npx average-time "yarn build:rollup" 5
```

- `tsup`
  - 17 sec
- `vite`
  - 7.7 sec
  - Quirks with watch mode
  - Seem to reemit all files all the time
  - Comes with `vitest`
- `rollup` with SWC
  - 6.9 sec
- `turbopack`
  - not yet available outside Next.js https://turbo.build/pack/docs#quickstart
- `swc` + `tsc`
  - 5.5 sec | 8.4 sec without `incremental`
- https://qwik.dev/
- https://tsdx.io/ Jared Palmer, I know him, project is dead
- `unbuild`