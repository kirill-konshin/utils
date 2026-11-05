---
name: auth
description: Next.js App Router authentication with `@kirill.konshin/auth` - one auth instance per app with a session strategy (`ironStrategy`, a sealed cookie the app writes; `neonStrategy`, Neon Auth's own session), password login, layout/page/route/proxy guards, return URLs, Neon Auth setup, code outside Next (agents) asking Next for the session. Use when adding or changing authentication, sign-in, sign-out or route protection in a Next.js app, adding Neon Auth, or migrating hand-rolled iron-session code.
---

Code samples and the migration table: the package [README](../../README.md).

# Instance

- ONE auth instance per app in `src/auth.ts`: `createPasswordAuth` (password-protected admin, iron) or `createAuth({ strategy })`
- Strategy, by who owns the session:
    - `ironStrategy` (`@kirill.konshin/auth/iron`): the app writes the session itself, e.g. tokens from its own OAuth; `strategy.setSession()` writes, `isValid` decides (default: the lib-owned `AUTHENTICATED` marker set by `login()`)
    - `neonStrategy` (`@kirill.konshin/auth/neon`): Neon Auth owns the session; `resolve(neonSession)` turns it into the app's (user, workspace), `null` refuses
- NEVER wrap one strategy's session into another (e.g. Neon's into an iron cookie)
- Pass Next's `Route` as the routes generic (`createPasswordAuth<Route>` / `createAuth<Session, Route>`) so `urls` and return URLs are type-checked
- `getSession()` returns the authenticated session or `null`; there is no unvalidated session to inspect
- Auth module MUST start with `import 'server-only'` and MUST NOT be module-level `'use server'` (it would expose session getters as actions); `loginAction`/`logoutAction` are thin function-level `'use server'` wrappers in the SAME module, no separate `actions.ts`, plain re-exports are not registered; ENFORCED BY AGENT
- Client Components MUST NOT import the auth module — Server Components pass `loginAction`/`logoutAction` down as props

# Iron strategy

- Cookie name MUST be unique per app (`<app>_session`), NEVER generic `session`
- Cookie secret `SESSION_SECRET` (≥32 chars) and login password `ADMIN_PASSWORD` are SEPARATE env vars
- NEVER compare passwords with `===`, use `verifyPassword` / `timingSafeEqualStrings`
- Session lifetime via `ttl` (seconds) ONLY, NEVER set `cookieOptions.maxAge`

# Neon strategy

- Set Neon Auth up per the `neon-auth` skill: `createNeonAuth` in the app (`src/lib/neonAuth.ts`), its handler at `app/api/auth/[...path]/route.ts`; pass that instance as `neonStrategy({ neonAuth })`
- Neon's own `cookies.sessionDataTtl` (default 300 s) already caches its session in a signed cookie; `authCacheTtl` (seconds, default `0` = off) additionally caches `resolve` per Neon session in Next's data cache, so `resolve` returns JSON-serializable data
- Link the Neon identity to the app's user once, in the sign-in callback route (allow-lists, first workspace), then call `strategy.forgetSession()` so an earlier `null` is not reused; `resolve` then only looks it up
- Sign-out through `auth.logout()`, which signs out of Neon and drops the cached session

# Guards

- Pages/layouts: `redirectNonAuthenticated()`, inside a `<Suspense>` of that page or layout (the check is request-time, `connection()`)
- Server Actions and Route Handlers: `throwNonAuthenticated()` / `authenticatedRouteHandler()` (401); layouts do not protect Route Handlers
- Login page: `redirectIfAuthenticated()`; it lives OUTSIDE the guarded layout, one Server Component with `<form action={loginAction}>`, errors via `?error=`; a Client Component (`useActionState` + `loginFormAction`) ONLY for pending/inline-error UI
- `proxy.ts`: `export const config = { matcher: [...] }` (a literal) + `auth.proxyGuard({ matcher: config.matcher })`; `urls.public` / `urls.protected` globs stay exhaustive (overlap throws, unknown paths warn and pass); list page routes in `urls.public` so the proxy only stamps `x-pathname`
- Reuse `auth.urls.*` instead of route literals; logout via `auth.logout()`

# Return URL

- ALWAYS extract it with `auth.getState()` (search params, `FormData`, `NextRequest`, raw string; internal paths only), NEVER hand-parse `state`
- NEVER store it in the session — concurrent tabs share the cookie; thread it via search params, form fields and the `x-pathname` header

# Code outside Next

- An agent runtime or worker that receives the browser's requests (e.g. an eve channel) MUST NOT import the auth module: it and Neon Auth's Next adapter import bare `next/*`, which Node's ESM loader cannot resolve
- It asks a Next Route Handler for the caller instead: forward the request's `cookie` header, the route answers with `auth.getSession()` (and any app checks) or `401`
