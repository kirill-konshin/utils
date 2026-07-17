---
type: always_apply
description: Set of rules for projects which use Tailwind
---

- Always use latest version of Tailwind
- Default UI library for use with Tailwind is Hero UI v3+
- Use the smallest possible configuration of Tailwind and Hero UI, adhere to their best practices (for Vite, Next.js integration, etc.)

# Hero UI

- Always extract Compound Components as reusable UI kit library of project-specific Components if used more than once, never duplicate boilerplate, except highly custom ones, if in doubt ask confirmation from user
- Use the shortest config: `@import "@heroui/react/styles";` in entrypoint CSS file is enough

# Webstorm

See [specific webstorm instructions](webstorm.md) if project uses Tailwind.
