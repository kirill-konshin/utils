---
name: lint-tailwind
description: Tailwind details for the tailwind rule - the safe-area `@utility` template and the eslint-plugin-tailwindcss / Oxlint setup (entry CSS detection, `cssConfigPath`, scoping, resolution errors). Use when adding safe-area utilities, or when Tailwind lint is set up, crashes or skips.
---

The binding rules are in [rules/tailwind.md](../../rules/tailwind.md). This skill holds the details.

# Safe-Area Utilities

```css
@utility top-safe {
    top: 1.5rem;
    top: max(1.5rem, env(safe-area-inset-top, 0px));
}

@utility right-safe {
    right: 1.5rem;
    right: max(1.5rem, env(safe-area-inset-right, 0px));
}

@utility bottom-safe {
    bottom: 1.5rem;
    bottom: max(1.5rem, env(safe-area-inset-bottom, 0px));
}

@utility left-safe {
    left: 1.5rem;
    left: max(1.5rem, env(safe-area-inset-left, 0px));
}
```

# ESLint (eslint-plugin-tailwindcss, bundled with @kirill.konshin/lint)

- With Vite+ the same plugin runs as an Oxlint JS plugin with the same detection; pass `tailwind: { cssConfigPath }` as `vitePlusConfig` options instead of `eslint.config.mjs`
- The plugin MUST be able to resolve the Tailwind entry CSS or it hard-crashes lint (ENOENT)
- Zero-config happy path: when the workspace contains exactly ONE `*.css` with `@import "tailwindcss"` (scanned across the root + every workspace package, `.gitignore`-aware), rules auto-enable with that entry
- Rules auto-scope to the workspace package owning the entry CSS (block `basePath`); pass `tailwind: { scoped: false }` to lint the whole workspace
- `tailwindcss` must be resolvable from the workspace root — if lint fails with "not resolvable from the workspace root", hoist it (see the `lint-npm-yarn` skill, "Hoisting") or add it to root `devDependencies`; run eslint with `LINT_DEBUG=1` to trace detection
- Several entry CSS candidates are ALWAYS a HARD ERROR (a silent skip is hard to notice)
    - pass `cssConfigPath` to pick one (if others are not useful) OR
    - create multiple leaf `eslint.config.ts` per app (if ALL need to be linted)
- When detection can't see `tailwindcss` (e.g. it lives only in leaf packages of a monorepo), force it with `tailwind: true` — then a missing entry CSS is a HARD ERROR instead of a silent skip
- ONLY when auto-find finds nothing (or several entries) pass the MANDATORY entry explicitly in `eslint.config.mjs`:

```js
import { defineLintConfig } from '@kirill.konshin/lint';

export default defineLintConfig({
    tailwind: {
        cssConfigPath: './src/styles/tailwind.css', // MANDATORY, relative to the package root
    },
});
```
