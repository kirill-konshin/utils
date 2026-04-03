---
type: always_apply # or agent_requested
description: Next.js patterns # Required for agent_requested
---

_EVERY_ Next.js page, layout, route handler or component must adhere to policy unless explicitly prohibited in comment before the component definition.

# General Guidelines

- Prefer Route Handlers for redirects
- Never use Pages Router
- Always use App Router
- Always use `next/navigation` instead of `next/router`
- Use `iron-session` for authentication

# Layouts

Always use https://nextjs.org/docs/app/api-reference/file-conventions/layout#layout-props-helper.

Always use the following pattern for all layouts:

```tsx
import React from 'react';

export default function Layout({ children }: LayoutProps<'/dashboard'>) {
    return (
        <section>
            {children}
            {/* If you have app/dashboard/@analytics, it appears as a typed slot: */}
            {/* {analytics} */}
        </section>
    );
}
```

## Check auth in layouts

Prefer `/app/(auth)/layout.tsx` as root layout for auth protection. This won't create path segment, but will protect all routes under it.

Remember that Route Handlers are not protected by layouts, so you need to add auth check there too.

```tsx
import React from 'react';
import { redirect } from 'next/navigation';
import { getToken } from '@/lib/auth';

export default async function Layout({ children }: LayoutProps<'/dashboard'>) {
    if (!(await getToken())) {
        redirect('/login'); // TODO Path here
    }
    return <>{children}</>;
}
```

# Pages

- https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes
- https://nextjs.org/docs/app/getting-started/layouts-and-pages#rendering-with-search-params

Always use https://nextjs.org/docs/app/api-reference/file-conventions/page#page-props-helper.

Always use the following pattern for all pages:

```tsx
export default async function Page({ params, searchParams }: PageProps<'/blog/[slug]'>) {
    const { slug } = await params;
    const { filter } = await searchParams;
    return <h1>Blog post: {slug}</h1>;
}
```

# Client Components

Use `'use client';` directive at the top of files that use client-side features:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { FC, memo, useEffect } from 'react';
```

https://nextjs.org/docs/app/getting-started/layouts-and-pages#creating-a-dynamic-segment
