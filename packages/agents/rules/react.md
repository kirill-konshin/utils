---
type: always_apply
description: Set of rules for projects which use React
paths:
    - '**/*.tsx'
---

**ALL** React component must adhere to policy unless explicitly prohibited in comment before the component definition.

- Prefer `PropsWithChildren<{...}>` to declare props of components with optional children
    - `children: ReactNode` if required
    - `JSX.Element` if exactly one JSX element like `<div />`
    - `ReactElement<...>` if object-specific
- If extending functionality of existing component use it's Props:
    - `type DerivedProps = CmpProps & {...}` if `Cmp` provides `CmpProps` (preferred)
    - `type DerivedProps = ComponentProps<typeof Cmp> & {...}` if `Cmp` does provide `CmpProps`
- ALWAYS prefer using memoized components
- Memoize everything
    - Prefer `memo<Props>(...)`
    - Use `FC<Props> = memo(...)` if `--isolatedDeclarations` flag is on
    - ALWAYS use `useCallback` if React Compiler is not enabled in project
- Prefer to set defaults while destructuring props: `function Cmp({ children = 'xxx' })` where applicable

```tsx
import { FC, memo } from 'react';
export type CmpProps = {
    /* types */
}; // or never if no props needed
export const Cmp: FC<CmpProps> = memo(function Cmp(props) {
    /* code */
});
```

# Object Merging

```tsx
const containerDefaultProps = SOME_GLOBAL_SETTING ? { ... } : {};

<Container {...{ ...containerDefaultProps, ...containerProps }} prop={override} />;
```

# Context

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

// Export hook for consumers
export const useExampleContext = () => {
    return useContext(ExampleContext);
};
```

# AbortController Pattern

```tsx
useEffect(() => {
    const ctrl = new AbortController();
    const { signal } = ctrl;

    window.addEventListener('keydown', handler, { signal, capture: true }); // capture for illustration purpose
    window.addEventListener('keyup', handler, { signal });

    return () => {
        ctrl.abort(); // instead of manual removeEventListener
    };
}, [deps]);
```
