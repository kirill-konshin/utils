---
type: always_apply
description: Set of rules for ALL projects
---

- When generating code respect max length set in `.editorconfig` or `.prettierrc` (could be with extension)
- Always wrap configurations in `defineConfig` if provided to ensure type safety (eslint, vite, vitest, jest, playwright, yarn, etc.)
- Prefer TS-based configurations if possible (next.js, vite, vitest)
