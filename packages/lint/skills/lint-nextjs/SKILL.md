---
name: lint-nextjs
description: Next.js App Router patterns - typed `LayoutProps` / `PageProps`, auth-guarded layouts, async `params` / `searchParams`, page and component file placement, what `defineNextConfig` sets in `next.config.ts` (incl. MUI `optimizePackageImports`). Use when writing or reviewing Next.js pages, layouts, route handlers or `next.config.ts`.
---

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

Prefer `/app/(auth)/layout.tsx` as root layout for auth protection. This won't create path segment, but will protect all routes under it.

Route Handlers are not protected by layouts, so add auth check there too.

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

- https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes
- https://nextjs.org/docs/app/getting-started/layouts-and-pages#rendering-with-search-params
- https://nextjs.org/docs/app/getting-started/layouts-and-pages#creating-a-dynamic-segment

Always use https://nextjs.org/docs/app/api-reference/file-conventions/page#page-props-helper.

Always use the following pattern for all pages:

```tsx
export default async function Page({ params, searchParams }: PageProps<'/blog/[slug]'>) {
    const { slug } = await params;
    const { filter } = await searchParams;
    return <h1>Blog post: {slug}</h1>;
}
```

# Files

- Do not make dummy pages that only import components, pages can be client, and should have most logic baked in, including one-off components (not exported)
- Reusable components should be in `src/components`
- As exception, separate component files are allowed to be in `src/app` next to relevant pages if one-off component is large so page itself becomes bloated, but `src/components` should not be polluted with one-offs, ask user if not sure
    - Example: `actions.ts` for `'use server'` actions while page is `'use client'`
- Admin pages: use as less custom JSX as possible — prefer Toolpad built-ins (`DashboardLayout`, `PageContainer`, `SignInPage`) over hand-rolled components

# `next.config.ts`

- Create `next.config.ts` with `defineNextConfig` from `@kirill.konshin/next/config` (the `/config` subpath, NEVER the barrel — Next transpiles `next.config.ts` to CJS and `require`s it outside any bundler): sets `cacheComponents`, `typedRoutes`, `experimental.typedEnv`, `reactStrictMode: false` and an exhaustive `experimental.optimizePackageImports` (`@mui/*`, `@toolpad/core`, `@fortawesome/*`, `@gravity-ui/*`, `lodash`, `@heroui/react`, `react-bootstrap`, `@kirill.konshin/icons` — extra entries are ignored, missing ones cost dev startup and bundle size, see MUI below)

## MUI

- When MUI is used with Next.js ALWAYS add barrel-heavy packages to `experimental.optimizePackageImports`: `@mui/material`, `@mui/system`, `@mui/icons-material`, `@mui/lab`, `@mui/x-data-grid`, `@toolpad/core`, plus the other usual suspects (`@fortawesome/*`, `@gravity-ui/icons`, `@gravity-ui/uikit`, `lodash`, `@heroui/react`, `react-bootstrap`, `@kirill.konshin/icons`)
- Prefer `defineNextConfig` from `@kirill.konshin/next/config` which sets the exhaustive list — extra entries are ignored, missing ones cost dev startup and bundle size (see `next.config.ts` above)
