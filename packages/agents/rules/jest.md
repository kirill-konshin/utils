---
type: always_apply # or agent_requested
description: Set of rules for projects with Jest # Required for agent_requested
---

# Config

Always prefer TS-based config. Choice of loader is dictated by other installed packages.

Omit `/** @jest-config-loader xxx */` by default if not necessary.

```ts
/** @jest-config-loader ts-node */
// or
/** @jest-config-loader esbuild-register */
// or
/** @jest-config-loader ts-node */
/** @jest-config-loader-options {"transpileOnly": true} */

import {defineConfig} from 'jest';

export default defineConfig({
  ...
});
```

# Monorepo

In monorepo define root jest project https://jestjs.io/docs/configuration#projects-arraystring--projectconfig.

```ts
import { defineConfig } from 'jest';

export default defineConfig({
    projects: ['<rootDir>', '<rootDir>/examples/*'],
});
```
