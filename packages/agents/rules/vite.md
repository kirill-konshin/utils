---
type: always_apply
description: Set of rules for projects with Vite
paths:
    - '**/vite.config.ts'
---

- Web Worker Polyfill `import '@vitest/web-worker';`

# Prefer the shortest possible config definition

```ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react(), tailwindcss()],
});
```
