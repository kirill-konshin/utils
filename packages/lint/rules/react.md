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
    - `type DerivedProps = ComponentProps<typeof Cmp> & {...}` if `Cmp` does not provide `CmpProps`
- Memoize components and callbacks unless React Compiler is enabled in the project
    - Prefer `memo<Props>(...)`
    - Use `FC<Props> = memo(...)` if `--isolatedDeclarations` flag is on
    - Wrap callbacks in `useCallback`
- Prefer to set defaults while destructuring props: `function Cmp({ children = 'xxx' })` where applicable

```tsx
import { FC, memo } from 'react';
export type CmpProps = {/* types */}; // or never if no props needed
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

- Type the context explicitly: `createContext<Value | null>(null)`
- Do not export the context; export its provider and a `useXContext` hook
- Memoize the provider value with `useMemo`
- Composition patterns, React 19 `use()` and `<Context>` as provider: the `vercel-composition-patterns` skill

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
