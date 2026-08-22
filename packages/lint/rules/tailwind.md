---
type: always_apply
description: Set of rules for projects which use Tailwind
---

- Use Tailwind ONLY for user-facing sites, NEVER for admin — admin interfaces ALWAYS use MUI + `@toolpad/core` (see mui.md)
- Always use latest version of Tailwind
- Default UI library for use with Tailwind is Hero UI v3+
- Use the smallest possible configuration of Tailwind and Hero UI, adhere to their best practices (for Vite, Next.js integration, etc.)
- Define safe-area insets as named Tailwind utilities; never repeat arbitrary `env(...)` or safe-area calculations in components
- Safe-area positioning utilities must use the maximum of a design-system gutter and the device-reported inset on every edge; insets can be zero on real devices, and adding both values creates excessive spacing when an inset is present

```css
:root {
    --safe-area-offset: 1rem;
    --safe-area-inset-top: env(safe-area-inset-top, 0px);
    --safe-area-inset-right: env(safe-area-inset-right, 0px);
    --safe-area-inset-bottom: env(safe-area-inset-bottom, 0px);
    --safe-area-inset-left: env(safe-area-inset-left, 0px);
}

@utility top-safe {
    top: max(var(--safe-area-offset), var(--safe-area-inset-top));
}

@utility right-safe {
    right: max(var(--safe-area-offset), var(--safe-area-inset-right));
}

@utility bottom-safe {
    bottom: max(var(--safe-area-offset), var(--safe-area-inset-bottom));
}

@utility left-safe {
    left: max(var(--safe-area-offset), var(--safe-area-inset-left));
}
```

# ESLint (eslint-plugin-tailwindcss, bundled with @kirill.konshin/lint)

- The plugin MUST be able to resolve the Tailwind entry CSS or it hard-crashes lint (ENOENT)
- Zero-config happy path: when the workspace contains exactly ONE `*.css` with `@import "tailwindcss"` (scanned across the root + every workspace package, `.gitignore`-aware), rules auto-enable with that entry
- Rules auto-scope to the workspace package owning the entry CSS (block `basePath`); pass `tailwind: { scoped: false }` to lint the whole workspace
- `tailwindcss` must be resolvable from the workspace root — if lint fails with "not resolvable from the workspace root", hoist it (see npm-yarn.md "Hoisting") or add it to root `devDependencies`; run eslint with `LINT_DEBUG=1` to trace detection
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

# Hero UI

- Always extract Compound Components as reusable UI kit library of project-specific Components if used more than once, never duplicate boilerplate, except highly custom ones, if in doubt ask confirmation from user
- Use the shortest config: `@import "@heroui/react/styles";` in entrypoint CSS file is enough

# Webstorm

See [specific webstorm instructions](webstorm.md) if project uses Tailwind.
