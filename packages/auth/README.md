# @kirill.konshin/auth

Authentication for Next.js App Router with one auth instance per app and a session strategy:

- `ironStrategy` — a sealed [iron-session](https://github.com/vvo/iron-session) cookie the app writes itself (password login, its own OAuth tokens)
- `neonStrategy` — [Neon Auth](https://neon.com/docs/auth/overview)'s own session, turned into the app's by a `resolve` callback, optionally cached

Either way it consolidates the session module, layout/page guards, login flow, Route Handler guards and `proxy.ts` guard into one factory.

```bash
yarn add @kirill.konshin/auth server-only iron-session # iron
yarn add @kirill.konshin/auth server-only @neondatabase/auth # Neon
```

# Rules

The `auth` skill ([skills/auth/SKILL.md](skills/auth/SKILL.md)) holds the rules for agents and reviewers; it installs with the package.

# Environment Variables

| Variable         | Purpose                                 | Required                                  |
| ---------------- | --------------------------------------- | ----------------------------------------- |
| `SESSION_SECRET` | Cookie sealing secret, min 32 chars     | yes (or `secret` config)                  |
| `ADMIN_PASSWORD` | Login password for `createPasswordAuth` | password auth only (or `password` config) |

Neon Auth reads its own variables (`NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`) where the app calls `createNeonAuth`; `SESSION_SECRET` is then not needed.

# Canonical Patterns

Adapt paths (`/login`, `/app`, `@/auth`) to the project; keep the structure.

## Session module — `src/auth.ts`

Password-protected app (admin dashboards, single-user tools):

```ts
import 'server-only';

import { createPasswordAuth } from '@kirill.konshin/auth';
import type { Route } from 'next';

// <Route> makes urls and all return-URL helpers type-checked against real routes (typedRoutes)
export const auth = createPasswordAuth<Route>({
    cookieName: 'myapp_session',
    urls: {
        login: '/login',
        afterLogin: '/app',
        public: ['/api/tiles/**', '/app/**'], // proxyGuard passes these; /app/** is enforced by its layout
        protected: ['/api/admin/**'], // proxyGuard requires a session here
    },
});

// Server actions live HERE, no separate actions.ts: the function-level 'use server' registers them
// in this app's build (a plain re-export would not — registration cannot happen in library code,
// and library closures are not serializable)
export const loginAction: typeof auth.loginAction = async (...args) => {
    'use server';
    return auth.loginAction(...args); // plain <form action>: errors go back via ?error= search param
};

export const logoutAction: typeof auth.logout = async (...args) => {
    'use server';
    return auth.logout(...args); // usable directly as <form action>, a FormData argument is ignored
};
```

Client Components can NEVER import this module (`server-only`, and function-level actions are not client-importable) — Server Components (pages/layouts) pass `loginAction`/`logoutAction` down as props.

Token/OAuth session on iron (custom shape + own `isValid`; the default checks the lib-owned `AUTHENTICATED` marker that `login()` sets — nothing to configure for password auth):

```ts
import 'server-only';

import { createAuth } from '@kirill.konshin/auth';
import { ironStrategy } from '@kirill.konshin/auth/iron';
import type { Route } from 'next';

export type Session = { accessToken?: string; refreshToken?: string; expiresAt?: number };

export const sessionStrategy = ironStrategy<Session>({
    cookieName: 'myapp_session',
    isValid: (session) => Boolean(session.accessToken && (!session.expiresAt || session.expiresAt > Date.now())),
});

export const auth = createAuth<Session, Route>({
    strategy: sessionStrategy,
    urls: { login: '/login', afterLogin: '/app' },
});
```

App-specific logic (e.g. OAuth token refresh) composes on top: `sessionStrategy.setSession(await refreshToken(...))`, `auth.destroySession()` on refresh failure; add the same `logoutAction` wrapper as above (`loginFormAction` is password auth only).

Neon Auth session (Neon signs in and out; `resolve` maps its user to the app's, `null` refuses):

```ts
import 'server-only';

import { createAuth } from '@kirill.konshin/auth';
import { neonStrategy } from '@kirill.konshin/auth/neon';
import type { Route } from 'next';

import { neonAuth } from '@/lib/neonAuth'; // createNeonAuth({ baseUrl, cookies: { secret, sessionDataTtl } })

export type Session = { userId: string; workspaceId: string };

export const auth = createAuth<Session, Route>({
    strategy: neonStrategy<Session>({
        neonAuth,
        resolve: async ({ user }) => findAppUser(user.id), // linked once by the sign-in callback
        authCacheTtl: 60, // seconds; 0 (default) looks up on every request
    }),
    urls: { login: '/login', afterLogin: '/app' },
});
```

Neon's own `cookies.sessionDataTtl` (default 300 s) already caches Neon's session in a signed cookie; `authCacheTtl` caches `resolve` on top of it in Next's data cache (`unstable_cache`, as `'use cache'` is not compiled inside a published package), per Neon session; `auth.logout()` drops that entry, and so does `strategy.forgetSession()`, which the sign-in callback calls after linking a new identity.

With Neon, `proxy.ts` (`auth.proxyGuard()`) MUST cover every page that reads the session, the login page and the sign-in callback included: the guard runs Neon's middleware there, which refreshes Neon's session cookie (a Server Component cannot write it, and Neon's `getSession()` would throw trying) and completes an OAuth sign-in. Do not call `neonAuth.middleware()` yourself.

Code outside Next that receives the browser's requests, such as an agent runtime, cannot import this module (it and Neon's Next adapter import bare `next/*`). It forwards the request's `cookie` header to a Route Handler that answers with `await auth.getSession()` or `401`.

## Protected layout — `app/(auth)/layout.tsx` or `app/app/layout.tsx`

```tsx
import { type ReactNode, Suspense } from 'react';

import { auth } from '@/auth';

export default function Layout({ children }: LayoutProps<'/app'>) {
    return (
        <Suspense>
            <Protected>{children}</Protected>
        </Suspense>
    );
}

async function Protected({ children }: { children: ReactNode }) {
    await auth.redirectNonAuthenticated(); // redirects to urls.login
    return <>{children}</>;
}
```

The deep current pathname is recovered automatically from the `x-pathname` header that `proxyGuard` stamps (cover page routes in the proxy matcher); without it login lands on `urls.afterLogin`. The login page MUST live OUTSIDE the guarded layout — the guard would redirect to itself; `urls.afterLogin` pointing at the login page throws at creation.

Route Handlers are not protected by layouts — guard them separately (below).

## Login page — `app/login/page.tsx`

The whole login flow is ONE Server Component file — the form posts `loginAction` directly, failures come back as the `?error=` search param:

```tsx
import { auth, loginAction } from '@/auth';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
    const params = await searchParams;
    const state = auth.getState(params);
    await auth.redirectIfAuthenticated(state);

    return (
        <form action={loginAction}>
            {typeof params.error === 'string' && <p>{params.error}</p>}
            <input type="hidden" name="state" value={state} />
            <input type="password" name="password" required autoFocus />
            <button type="submit">Login</button>
        </form>
    );
}
```

A Client Component is only justified when it adds something — pending spinners, inline validation. Then wrap `auth.loginFormAction` (the `useActionState` variant that RETURNS the error instead of redirecting) and pass it down as a prop:

```tsx
'use client';
// <LoginForm loginAction={loginFormAction} state={state} /> rendered by the page above
import type { PasswordAuth } from '@kirill.konshin/auth';
import { useActionState } from 'react';

export function LoginForm({ loginAction, state }: { loginAction: PasswordAuth['loginFormAction']; state?: string }) {
    const [error, action, isPending] = useActionState(loginAction, null);
    // same form; disable the button with isPending, render {error} inline
}
```

Admin login screens use MUI + `@toolpad/core` `SignInPage` per project rules — pass `loginFormAction` results into its `signIn` callback.

## Route Handler — `app/api/*/route.ts`

```ts
import { auth } from '@/auth';

export const GET = auth.authenticatedRouteHandler(async () => Response.json(await loadData()));
```

Inside Server Actions use `await auth.throwNonAuthenticated()` (throws `Unauthorized`) instead.

## Proxy guard (whole `/api` surface) — `src/proxy.ts`

```ts
import { auth } from '@/auth';

export const config = { matcher: ['/api/:path*', '/app/:path*'] }; // literal, statically parsed by Next.js

export const proxy = auth.proxyGuard({ matcher: config.matcher });
```

Next.js statically parses `proxy.ts`: `config` MUST be a literal object and the handler a visible function export — neither can be destructured from a runtime value. The matcher may be BROADER than the `urls` globs, but must cover them all: `proxyGuard` verifies the supplied `matcher` at creation and THROWS on uncovered globs (paths outside the matcher never reach the proxy at all). Omit `matcher`/`config` entirely to run the guard on every path.

The guard classifies each request by the `urls.public` / `urls.protected` globs: public passes without a session, protected gets the session check (`503` unconfigured / `401` unauthenticated), a path matching BOTH sets throws (config error), a path matching NEITHER logs a warning and passes as public — keep the glob lists exhaustive. Without any globs everything behind the matcher is protected. `allow: (request) => boolean` remains as an extra request-level bypass.

Every forwarded request is stamped with the `x-pathname` header (`PATHNAME_HEADER`) so `redirectNonAuthenticated()` in layouts can return users to the page they were on. List page routes in `urls.public` and cover them in the matcher: the session there is enforced by the layout (a `401` JSON would be wrong for pages), the guard only stamps the header.

# Migration From Hand-Rolled Modules

| Old pattern                                                  | Replacement                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| `getIronSession(await cookies(), sessionOptions)` wrapper    | `auth.getSession()`                                          |
| `createAuth({ cookieName, secret, isValid, ... })` (0.x)     | `createAuth({ strategy: ironStrategy({ ... }) })`            |
| `auth.setSession(data)` / `auth.getSessionOptions()` (0.x)   | `strategy.setSession(data)` / `strategy.getSessionOptions()` |
| `auth.isValid(await auth.getSession())` (0.x)                | `await auth.getSession()` (already validated, or `null`)     |
| Neon Auth session folded into an iron cookie                 | `neonStrategy({ neonAuth, resolve })`                        |
| `isLoggedIn()` / `isAdminAuthenticated()` / `getToken()`     | `auth.isAuthenticated()`                                     |
| `ensureAuth()` / `requireAdminSession()` (throwing)          | `auth.throwNonAuthenticated()`                               |
| `authError()` returning a `401 Response`                     | `auth.authenticatedRouteHandler(handler)`                    |
| Layout `if (!token) redirect('/login?state=...')`            | `auth.redirectNonAuthenticated()`                            |
| Login page `if (loggedIn) redirect(...)`                     | `auth.redirectIfAuthenticated(state)`                        |
| Hand-written `proxy.ts` / `middleware.ts` session check      | `auth.proxyGuard({ allow })`                                 |
| `session.destroy(); redirect('/login')`                      | `auth.logout()`                                              |
| `password === candidate`                                     | `auth.verifyPassword(candidate)`                             |
| `ttl` / `cookieOptions.maxAge` juggling                      | `ttl` config in seconds, nothing else                        |
| `'use server'` on the session module / separate `actions.ts` | function-level `'use server'` wrappers in the auth module    |
| `SESSION_PASSWORD` / `PASSWORD` env vars                     | `SESSION_SECRET` + `ADMIN_PASSWORD`                          |
| `loginState(state)` / `typeof state === 'string'` fiddling   | `auth.getState(...)`                                         |
| Hand-rolled `x-pathname` proxy + `headers()` in layout       | built into `proxyGuard` + `redirectNonAuthenticated()`       |
| `defaultSession` constant (unused everywhere)                | delete                                                       |

Checklist after migration: unique `cookieName`, secret only in `SESSION_SECRET`, no direct `getIronSession` imports left in the app, all four surfaces guarded (layout, login, route handlers, proxy).

Existing sessions: keeping the old `cookieName` and secret (both configurable) means old cookies still unseal — a session in an old shape simply fails `isValid`, so users are logged out naturally, never crash; `login()` starts a fresh session so stale fields from old shapes do not linger. A failed unseal (rotated secret) also degrades to logged-out.
