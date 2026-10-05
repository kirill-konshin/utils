---
type: always_apply
description: Set of rules for projects which use Next.js
---

_EVERY_ Next.js page, layout, route handler or component must adhere to policy unless explicitly prohibited in comment before the component definition.

Use `lint-nextjs` skill when working with Next.js projet.

# General Guidelines

- Prefer Route Handlers for redirects
- Never use Pages Router
- Always use App Router
- Use `iron-session` for authentication via `@kirill.konshin/auth`, see auth.md
- Server-only modules (auth/session, DB access, anything touching secrets, `'use server'` actions files) MUST start with `import 'server-only'` (the npm package, add as dependency) — ENFORCED BY AGENT: no ESLint rule checks this, add it when creating such modules and flag it when reviewing
- `package.json` MUST ALWAYS have version of Next.js, NEVER `*`, otherwise Vercel will fall into legacy mode instead of serverless
- ALWAYS create `next.config.ts` with `defineNextConfig` from `@kirill.konshin/next/config` (the `/config` subpath, NEVER the barrel — Next transpiles `next.config.ts` to CJS and `require`s it outside any bundler): sets `cacheComponents`, `typedRoutes`, `experimental.typedEnv`, `reactStrictMode: false` and an exhaustive `experimental.optimizePackageImports` (`@mui/*`, `@toolpad/core`, `@fortawesome/*`, `@gravity-ui/*`, `lodash`, `@heroui/react`, `react-bootstrap`, `@kirill.konshin/icons` — extra entries are ignored, missing ones cost dev startup and bundle size, see mui.md)
- Use `@kirill.konshin/icons` for FontAwesome / Gravity UI icons — the barrel is safe with `optimizePackageImports` (`defineNextConfig` sets it)
- Do not make dummy pages that only import components, pages can be client, and should have most logic baked in, including one-off components (not exported)
- Reusable components should be in `src/components`
- As exception, separate component files are allowed to be in `src/app` next to relevant pages if one-off component is large so page itself becomes bloated, but `src/components` should not be polluted with one-offs, ask user if not sure
    - Example: `actions.ts` for `'use server'` actions while page is `'use client'`

# Admin Pages & Login

- ALWAYS use MUI + [`@toolpad/core`](https://mui.com/toolpad/core/introduction/) for admin page layouts and login screens, with the App Router integration (`NextAppProvider` from `@toolpad/core/nextjs`), see mui.md
- ALWAYS prefer `@kirill.konshin/mui/admin` (`AdminAppProvider`, `AdminDashboardLayout`, `AdminSignInPage`) — encapsulates the Toolpad boilerplate and wires `@kirill.konshin/auth`, see mui.md
- Use as less custom JSX as possible — prefer Toolpad built-ins (`DashboardLayout`, `PageContainer`, `SignInPage`) over hand-rolled components
- Tailwind is ONLY for user-facing sites, NEVER for admin (see tailwind.md)
