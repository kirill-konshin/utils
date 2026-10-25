---
type: always_apply
description: Set of rules for projects with Vite
paths:
    - '**/vite.config.ts'
    - '**/vitest.config.ts'
---

# Vite+ (vite-plus, vp)

- Prefer [Vite+](https://viteplus.dev) (`vite-plus`, `vp` CLI): `defineConfig` from `vite-plus`, root `vite.config.ts` is `defineConfig(vitePlusConfig())` (`@kirill.konshin/lint/vite-plus`), settings and project blocks in `lint.config.ts`, see the package README
- Libraries build with `vp pack` (`pack` block, tsdown), apps with `vp build`, tests run with `vp test` and import from `vite-plus/test`
- Keep `lint`/`fmt` in the root config only; per-package settings go to `lint.overrides`/`fmt.overrides`

# Vitest

- Web Worker Polyfill `import '@vitest/web-worker';`
- In monorepo define root vitest project https://vitest.dev/guide/projects.html#defining-projects

# Prefer the shortest possible config definition

```ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';

export default defineConfig({
    plugins: [react(), tailwindcss()],
});
```
