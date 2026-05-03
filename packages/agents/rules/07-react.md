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

## Import Order

Organize imports in this order:

1. React imports first
2. Third-party library imports
3. Local imports (relative paths)

```tsx
import React, { FC, memo, useState, useCallback } from 'react';
import { Button, Modal } from 'react-bootstrap';
import clsx from 'clsx';

import { GenericControl } from './genericControl';
import { create, Validation } from './form';
```

## Props Patterns

### Children Prop

Always type `children` as `any` for flexibility:

```tsx
export type LoadingProps = {
    children?: any;
    show?: boolean;
};
```

### Default Props

Use default parameter values in destructuring:

```tsx
export const Loading: FC<LoadingProps> = memo(function Loading({
    children = 'Loading...' as any,
    show = true,
    className = '',
    size,
}) {
    // ...
});
```

### Extending Library Props

Extend library component props with intersection types:

```tsx
export type GenericControlProps = FormControlProps & { children: any };

export type AppLinkProps = {
    children: any;
    exact?: boolean;
    activeClassName?: any;
} & LinkProps &
    ComponentProps<typeof Link>;
```

## Hook Patterns

### Custom Hooks

Return explicit types for custom hooks:

```tsx
export function useModal({ onClose, showOnMount }: UseModalArgs = {}): {
    show: boolean | undefined;
    close: () => void;
    open: () => void;
    ModalDialog: FC<ModalProps>;
} {
    // ...
}
```

### Hook with Callbacks

Use `useCallback` for functions passed to children or used in dependencies:

```tsx
const close = useCallback((): void => {
    setShow(false);
    onClose?.();
}, [onClose]);
```

### Factory Functions for Hooks

Create factory functions that return hooks for schema-bound functionality:

```tsx
export function createClient<S extends z.ZodObject<any>>(
    schema: S,
): {
    useValidation: (...) => [...];
    useValidationTransition: (...) => [...];
} {
    // ...
    return { useValidation, useValidationTransition };
}
```

## Context Patterns

```tsx
'use client';

import { createContext, useContext, useMemo, useState, ReactNode } from 'react';

// Always type Context explicitly
// Never export context itself
const ExampleContext = createContext<{
    setEnabled: (prev: boolean) => boolean;
    enabled: false;
}>(null);

// Export provider
export function ExampleContextProvider({ children }: { children: ReactNode }) {
    // context state & functions
    const [enabled, setEnabled] = useState(true);

    // memoize context value
    const value = useMemo(() => ({ enabled, setEnabled }), [enabled, setEnabled]);

    return <ExampleContext.Provider value={control}>{children}</ExampleContext.Provider>;
}

// Export hook
export const useExampleContext = () => {
    return useContext(ExampleContext);
};
```

## Storybook Patterns

### Story File Structure

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { ComponentName } from './componentName';

const meta: Meta<typeof ComponentName> = {
    title: 'Category / ComponentName',
    component: ComponentName,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        // control definitions
    },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithArgs: Story = {
    args: {
        // props
    },
};
```

## AbortController Pattern

Use AbortController for cleanup in effects:

```tsx
useEffect(() => {
    const ctrl = new AbortController();

    window.addEventListener('keydown', handler, { signal: ctrl.signal, capture: true });

    return () => {
        ctrl.abort();
    };
}, [deps]);
```
