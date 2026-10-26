---
type: always_apply
description: Set of rules for projects which use Next.js
paths:
    - '**/next.config.*'
    - '**/app/**'
    - '**/proxy.ts'
---

_EVERY_ Next.js page, layout, route handler or component must adhere to policy unless explicitly prohibited in comment before the component definition.

Use the `lint-nextjs` skill when working with a Next.js project.

# General Guidelines

- Prefer Route Handlers for redirects
- Never use Pages Router
- Always use App Router
- Use `iron-session` for authentication via `@kirill.konshin/auth`, see [auth.md](auth.md)
- Server-only modules MUST start with `import 'server-only'`: see [typescript.md](typescript.md)
- `package.json` MUST ALWAYS have version of Next.js, NEVER `*`, otherwise Vercel will fall into legacy mode instead of serverless
- ALWAYS create `next.config.ts` with `defineNextConfig` from `@kirill.konshin/next/config` (the `/config` subpath, NEVER the barrel — Next transpiles `next.config.ts` to CJS and `require`s it outside any bundler); what it sets: the `lint-nextjs` skill
- Use `@kirill.konshin/icons` for FontAwesome / Gravity UI icons — the barrel is safe with `optimizePackageImports` (`defineNextConfig` sets it); this overrides `bundle-barrel-imports` of the `vercel-react-best-practices` skill
- Page and component file placement: the `lint-nextjs` skill

# Admin Pages & Login

- ALWAYS use MUI for admin page layouts and login screens, see the `lint-mui` skill
- ALWAYS prefer `@kirill.konshin/mui/admin` (`AdminAppProvider`, `AdminDashboardLayout`, `AdminSignInPage`) — encapsulates the Toolpad boilerplate and wires `@kirill.konshin/auth`, see the `lint-mui` skill; `@toolpad/core` is archived, add no new direct Toolpad usage
- Tailwind is ONLY for user-facing sites, NEVER for admin (see [tailwind.md](tailwind.md))
