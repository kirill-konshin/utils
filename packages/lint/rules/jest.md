---
type: always_apply
description: Set of rules for projects with Jest
paths:
    - '**/jest.config.{ts,js,mjs,cjs}'
---

- Always prefer TS-based config. Choice of loader is dictated by other installed packages, https://jestjs.io/docs/configuration (first tip about loaders)
- In monorepo define root jest project https://jestjs.io/docs/configuration#projects-arraystring--projectconfig
