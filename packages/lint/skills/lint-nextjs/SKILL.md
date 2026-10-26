---
name: lint-nextjs
description: Our Next.js App Router conventions on top of the vendor Next.js skills - typed `LayoutProps` / `PageProps`, auth-guarded layouts, `params` / `searchParams` in server and client pages, page and component file placement, what `defineNextConfig` sets in `next.config.ts`. Use when writing or reviewing Next.js pages, layouts, route handlers or `next.config.ts`.
---

The binding rules are in [rules/nextjs.md](../../rules/nextjs.md). Next.js API knowledge: the docs that `next` bundles (`node_modules/next/dist/docs/`), the `next-*` skills and the `vercel-react-best-practices` skill; MUI setup: the `material-ui-nextjs` skill.

# Layouts

Always use https://nextjs.org/docs/app/api-reference/file-conventions/layout#layout-props-helper:

```tsx
import React from 'react';

export default function Layout({ children, analytics }: LayoutProps<'/dashboard'>) {
    return (
        <>
            {children}
            {/* If you have app/dashboard/@analytics, it appears as a typed slot: */}
            {analytics}
        </>
    );
}
```

## Check auth in layouts pattern

Put the auth guard in the layout of a route group, `app/(auth)/layout.tsx`: the group adds no path segment and protects every route below it.

Layouts do not protect Route Handlers: check auth in each handler too.

Use `@kirill.konshin/auth` (see [rules/auth.md](../../rules/auth.md)); the guard runs inside `<Suspense>`:

```tsx
import { type ReactNode, Suspense } from 'react';

import { auth } from '@/auth';

export default function Layout({ children }: LayoutProps<'/dashboard'>) {
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

# Pages

Type pages with the [`PageProps` helper](https://nextjs.org/docs/app/api-reference/file-conventions/page#page-props-helper). `params` and `searchParams` are Promises.

A server page awaits them:

```tsx
export default async function Page({ params, searchParams }: PageProps<'/blog/[slug]'>) {
    const { slug } = await params;
    const { filter } = await searchParams;
    return <h1>Blog post: {slug}</h1>;
}
```

A client page (`'use client'`) cannot be async: unwrap them with `use()`, or read them with `useParams()` / `useSearchParams()`:

```tsx
'use client';

import { use } from 'react';

export default function Page({ params }: PageProps<'/blog/[slug]'>) {
    const { slug } = use(params);
    return <h1>Blog post: {slug}</h1>;
}
```

# Files

- A page holds its logic and its one-off components (not exported); it may be a client page. A page that only imports one component is a dummy page.
- Reusable components go in `src/components`.
- A large one-off component may sit in `src/app` next to its page, so the page stays small; `src/components` keeps no one-offs.
    - Example: `actions.ts` with `'use server'` actions beside a `'use client'` page
- Admin pages: the `lint-mui` skill.

# `next.config.ts`

`defineNextConfig` from `@kirill.konshin/next/config` (the `/config` subpath: Next transpiles `next.config.ts` to CJS and `require`s it outside any bundler) sets `cacheComponents`, `typedRoutes`, `experimental.typedEnv`, `reactStrictMode: false` and an exhaustive `experimental.optimizePackageImports` (`@mui/*`, `@toolpad/core`, `@fortawesome/*`, `@gravity-ui/*`, `lodash`, `@heroui/react`, `react-bootstrap`, `@kirill.konshin/icons`, …). Extra entries cost nothing; a missing one costs dev startup time and bundle size.

```ts
import { defineNextConfig } from '@kirill.konshin/next/config';

export default defineNextConfig((defaults) => ({ ...defaults, transpilePackages: ['my-lib'] }));
```
