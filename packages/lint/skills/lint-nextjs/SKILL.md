---
name: lint-nextjs
description: Our Next.js App Router conventions on top of the vendor Next.js skills - `next typegen` in `postinstall`, typed `LayoutProps` / `PageProps`, auth-guarded layouts, `params` / `searchParams` in server and client pages, page and component file placement, where `next.config.ts` details are. Use when writing or reviewing Next.js pages, layouts, route handlers or `next.config.ts`.
---

The binding rules are in [rules/nextjs.md](../../rules/nextjs.md). Next.js API knowledge: the docs that `next` bundles (`node_modules/next/dist/docs/`), the `next-*` skills and the `vercel-react-best-practices` skill; MUI setup: the `material-ui-nextjs` skill.

# Route types in `postinstall`

`LayoutProps`, `PageProps` and `RouteContext` are global types that Next.js generates into `.next/types`, referenced from `next-env.d.ts` (both gitignored). `next dev` and `next build` write them, so a fresh clone or a CI type check (`vp check`) fails without them. Every Next.js app runs `next typegen` in `postinstall`:

```jsonc
{
    "scripts": {
        "postinstall": "lint-prepare init && vp config && next typegen",
    },
}
```

- Monorepo: `next typegen` goes into the `postinstall` of each Next.js app package, not the root

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

Put the auth guard in the layout of a route group, `app/(auth)/layout.tsx`: the group adds no path segment and protects every route below it. Layouts do not protect Route Handlers: check auth in each handler too. The guard and its `<Suspense>` boundary: the `auth` skill of `@kirill.konshin/auth`.

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

`defineNextConfig` of `@kirill.konshin/next/config`: what it sets and how to extend it is in the `next` skill, it installs with the package. The same skill lists the package's utilities (`AppLink`, `SoftLink`, `NoSSR`, …).
