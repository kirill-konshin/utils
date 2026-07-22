---
type: always_apply
description: Set of rules for projects which use Tailwind
---

- Always use latest version of Tailwind
- Default UI library for use with Tailwind is Hero UI v3+
- Use the smallest possible configuration of Tailwind and Hero UI, adhere to their best practices (for Vite, Next.js integration, etc.)

# ESLint (eslint-plugin-tailwindcss, bundled with @kirill.konshin/lint)

- The plugin MUST be able to resolve the Tailwind entry CSS or it hard-crashes lint (ENOENT)
- Zero-config happy path: when `tailwindcss` is installed and the workspace contains exactly ONE `*.css` with `@import "tailwindcss"` (scanned ≤3 dir levels, `.gitignore`-aware), rules auto-enable with that entry
- ONLY when auto-find finds nothing (or several entries) add the block manually with a MANDATORY `settings.tailwindcss.cssConfigPath` in `eslint.config.mjs`:

```js
import customConfig, { tailwindPlugin } from '@kirill.konshin/lint';

export default defineConfig([
    ...customConfig,
    {
        ...tailwindPlugin.configs.recommended,
        settings: {
            tailwindcss: {
                cssConfigPath: './src/styles/tailwind.css', // MANDATORY, relative to the package root
            },
        },
    },
]);
```

# Hero UI

- Always extract Compound Components as reusable UI kit library of project-specific Components if used more than once, never duplicate boilerplate, except highly custom ones, if in doubt ask confirmation from user
- Use the shortest config: `@import "@heroui/react/styles";` in entrypoint CSS file is enough

# Webstorm

See [specific webstorm instructions](webstorm.md) if project uses Tailwind.
