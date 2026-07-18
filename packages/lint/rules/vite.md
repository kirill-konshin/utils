---
type: always_apply
description: Set of rules for projects with Vite
paths:
    - '**/vite.config.ts'
---

- Web Worker Polyfill `import '@vitest/web-worker';`
- In monorepo define root vitest project https://vitest.dev/guide/projects.html#defining-projects

# Prefer the shortest possible config definition

```ts
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react(), tailwindcss()],
});
```
