---
type: always_apply
description: Set of rules for projects which use Tailwind
paths:
    - '**/*.css'
    - '**/*.tsx'
---

The `@utility` template and the lint-plugin setup: the `lint-tailwind` skill.

- Use Tailwind ONLY for user-facing sites, NEVER for admin — admin interfaces ALWAYS use MUI (see the `lint-mui` skill)
- Always use latest version of Tailwind
- Default UI library for use with Tailwind is Hero UI v3+ (the `heroui-react` skill);
    - `shadcn/ui` only in projects that already use it — this overrides the `shadcn` skill
- Use the smallest possible configuration of Tailwind and Hero UI, adhere to their best practices (for Vite, Next.js integration, etc.)
- Define safe-area insets as named Tailwind utilities; never repeat arbitrary `env(...)` or safe-area calculations in components
- Safe-area positioning utilities must declare an unconditional design-system gutter first, then enhance it with the maximum of that gutter and the device-reported inset on every edge; use at least `1.5rem` for floating controls because insets can be zero and custom-property resolution can fail on real devices
- Lint (eslint-plugin-tailwindcss, also as an Oxlint JS plugin with Vite+) MUST resolve the Tailwind entry CSS, else it crashes; setup: the `lint-tailwind` skill

# Hero UI

- Always extract Compound Components as reusable UI kit library of project-specific Components if used more than once, never duplicate boilerplate, except highly custom ones, if in doubt ask confirmation from user
- Use the shortest config: `@import "@heroui/react/styles";` in entrypoint CSS file is enough

# Webstorm

See the `lint-webstorm` skill (`.idea/tailwindcss.xml`) if project uses WebStorm.
