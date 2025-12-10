---
type: always_apply # or agent_requested
description: React patterns # Required for agent_requested
---

_EVERY_ React component must adhere to policy unless explicitly prohibited in comment before the component definition.

## Extracting props from other library components

```tsx
import React, { ComponentProps, FC } from 'react';
import Link, { LinkProps } from 'next/link'; // example component

export const AppLink: FC<
    LinkProps & ComponentProps<typeof Link> // if LinkProps are available prefer it, otherwise extract from Link (Link is used as example)
> = function AppLink({ href, children, ...props }) {
    return (
        <Link href={href} {...props}>
            {children}
        </Link>
    );
};
```

## Component Pattern

Prefer using memoized components. Use `FC<Props> = memo(...)` pattern to ensure compatibility with TypeScript's `--isolatedDeclarations` flag:

```tsx
import { FC, memo } from 'react';

export type CmpProps = {
    foo: string;
};

export const Cmp: FC<CmpProps> = memo(function Cmp({ foo, ...props }) {
    // code here
});
```

If memo is not applicable:

```tsx
import { FC } from 'react';

export type CmpProps = {
    foo: string;
};

export const Cmp: FC<CmpProps> = function Cmp({ foo, ...props }) {
    // code here
};
```

If `CmpProps` will be empty use `export type CmpProps = never;`.
