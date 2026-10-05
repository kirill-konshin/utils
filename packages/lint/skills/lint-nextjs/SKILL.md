---
name: lint-nextjs
description: Describes key patterns how to work with Next.js
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

```tsx
import React from 'react';
import { redirect } from 'next/navigation';
import { getToken } from '@/lib/auth';

export default async function Layout({ children }: LayoutProps<'/dashboard'>) {
    if (!(await getToken())) {
        redirect('/login');
    }
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
