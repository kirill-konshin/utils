---
name: module-boundaries
description: Nx platform tags and @nx/enforce-module-boundaries, which decide what packages may import. Use when creating a package, adding a dependency between packages or fixing a module boundaries lint error.
---

# Module Boundaries

Every package is tagged in its `package.json` `nx` key with a `platform:*` tag (`universal`, `node`, `browser`, `worker`, `react`, `next`, `react-native`, `electron`, `tooling`, `umbrella`); demos are `type:demo`. The `@nx/enforce-module-boundaries` rule (an Oxlint JS plugin, configured in `vitePlus.lint.overrides` of the root `lint.config.ts`) restricts which platforms may import which — e.g. `platform:react` code cannot import `platform:worker` or `platform:node` packages. When creating a package, assign the appropriate tag; when a legitimate new dependency direction appears, extend `depConstraints` in `lint.config.ts` rather than removing tags.
