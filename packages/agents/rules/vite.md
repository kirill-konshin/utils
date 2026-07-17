---
type: always_apply # or agent_requested
description: Set of rules for projects with Vite # Required for agent_requested
---

# Config

Prefer the shortest possible config definition.

```ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react(), tailwindcss()],
});
```

# Web Worker Polyfill

```ts
import '@vitest/web-worker';
```
