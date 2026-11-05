---
type: always_apply
description: Set of rules for user auth (only for Next.js)
paths:
    - '**/*.tsx'
    - '**/*.ts'
---

Patterns, strategies, Neon Auth setup, password login and migration: the `auth` skill of `@kirill.konshin/auth`, it installs with the package.

- ALWAYS use [`@kirill.konshin/auth`](https://github.com/kirill-konshin/utils/tree/main/packages/auth) ([npm](https://www.npmjs.com/package/@kirill.konshin/auth)) for authentication in Next.js apps, NEVER hand-roll `iron-session` or Neon Auth session wrappers
- ONE auth instance per app in `src/auth.ts`, with ONE session strategy: `ironStrategy` (the app writes a sealed cookie; `createPasswordAuth` for password admin) or `neonStrategy` (Neon Auth owns the session); NEVER wrap one session into another
- Auth module MUST start with `import 'server-only'` and MUST NOT be module-level `'use server'`; `loginAction`/`logoutAction` are function-level `'use server'` wrappers in the SAME module, plain re-exports are NOT registered as actions; ENFORCED BY AGENT: no ESLint rule checks this, add on creation, flag on review (see [nextjs.md](nextjs.md))
- Client Components MUST NOT import the auth module; Server Components pass `loginAction`/`logoutAction` down as props
- Code outside Next (agent runtimes, workers) MUST NOT import the auth module: it asks a Next Route Handler for the session, forwarding the request's `cookie` header
- Iron: cookie name unique per app (`<app>_session`); `SESSION_SECRET` (≥32 chars) and `ADMIN_PASSWORD` are SEPARATE env vars; lifetime via `ttl` ONLY, NEVER `cookieOptions.maxAge`
- NEVER compare passwords with `===`, use `verifyPassword` / `timingSafeEqualStrings`
- Guard pages/layouts with `redirectNonAuthenticated()` (inside `<Suspense>`), Server Actions and Route Handlers with `throwNonAuthenticated()` or `authenticatedRouteHandler()`, the `/api` surface with `proxyGuard()` in `proxy.ts`, the login page with `redirectIfAuthenticated()`
- `proxy.ts`: a LITERAL `config.matcher` + `auth.proxyGuard({ matcher: config.matcher })`; `urls.public` / `urls.protected` globs stay exhaustive
- ALWAYS extract the return URL with `auth.getState()`, NEVER hand-parse `state`, NEVER store it in the session
- Login page lives OUTSIDE the guarded layout; logout via `auth.logout()`
