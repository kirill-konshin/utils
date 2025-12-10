# Coding Style

General coding style and conventions used across the codebase.

## File Organization

### File Naming

- Use `camelCase` for file names: `createWindow.ts`, `useFetch.ts`, `genericControl.tsx`
- Use `.tsx` extension for files with JSX, `.ts` for pure TypeScript
- Test files: `*.test.ts` or `*.test.tsx`
- Story files: `*.stories.tsx`
- Fixture files: `*.fixture.ts`

### File Structure

Organize files in this order:

1. Imports
2. Types/Interfaces
3. Constants
4. Helper functions (private)
5. Main exports (classes, functions, components)

```ts
import { something } from 'library';

// Types
export type MyType = { ... };

// Constants
const CONSTANT = 'value';

// Helpers
const helperFn = () => { ... };

// Main exports
export function mainFunction() { ... }
```

## Naming Conventions

### Variables and Functions

- Use `camelCase` for variables and functions
- Use descriptive names that indicate purpose
- Prefix boolean variables with `is`, `has`, `can`, `should`:

```ts
const isDev: boolean = process.env['NODE_ENV'] === 'development';
const hasError = !!error;
const canRender = true;
```

### Constants

- Use `UPPER_SNAKE_CASE` for true constants
- Use `Symbol()` for unique identifiers:

```ts
const FILE_NOT_FOUND = -6;
const UNUSED = Symbol('UNUSED');
const RESPONDER = Symbol('responder');
export const ANY: unique symbol = Symbol('*');
```

### Classes

- Use `PascalCase` for class names
- Use descriptive names ending with purpose: `TransformerMap`, `WorkerDialog`, `RespondersBase`

## Function Patterns

### Arrow Functions vs Function Declarations

Use arrow functions for:

- Short utility functions
- Callbacks
- Exported simple functions

```ts
export const shallowCompare = (prev: any, next: any): boolean =>
    Array.from(new Set([...Object.keys(prev), ...Object.keys(next)])).every((key) => prev[key] === next[key]);

const getPath = async (path_, file = '') => { ... };
```

Use function declarations for:

- Complex functions with multiple statements
- Functions that need hoisting
- Named functions inside closures

```ts
function checkClosed(obj: any, label: string = 'external') {
    if (obj?.closed) throw new Error(`Context ${obj.id} is closed (${label})`, { cause: obj });
}

async function memoized(...args: Key) {
    // multiple statements
}
```

### Factory Functions

Use factory functions to create configured instances:

```ts
export function createMeasurer({
    colors = true,
    prepend = 'LOG',
    padding = 10,
}: {
    colors?: boolean;
    prepend?: string;
    padding?: number;
}): {
    measure: (...) => { ... };
    important: (str: any) => any;
} {
    // implementation
    return { measure, important, subject, arg, sup, ok, err };
}
```

### Closure Pattern

Return objects with methods that close over internal state:

```ts
export function memo<Key extends any[], Val>(...): {
    (...args: Key): Promise<{ value?: Val; hit: boolean }>;
    clear: (...condition: Key | any[]) => void;
    size: () => number;
} {
    const map = new ManyKeysMap<SerializedKey, Val>();

    const clear = (...condition: Key | any[]) => { ... };
    const size = () => map.size;

    async function memoized(...args: Key) { ... }

    memoized.clear = clear;
    memoized.size = size;

    return memoized;
}
```

## Async Patterns

### Promise Handling

Use async/await over raw promises:

```ts
// ✅ Good
const result = await fn(...args);

// ❌ Avoid
fn(...args).then(result => { ... });
```

### Error Handling in Async

Wrap async operations in try/catch:

```ts
try {
    resolve(await fn());
} catch (e) {
    reject(e);
}
```

### Promise.race for Timeouts/Cancellation

```ts
export function rejectOnSignal(promise: Promise<any>, signal: AbortSignal): Promise<Event['data']> {
    return Promise.race([
        promise,
        new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => reject('RaceAborted:' + signal.reason), { once: true, signal });
        }),
    ]);
}
```

## Export Patterns

### Barrel Exports

Use `index.ts` files for re-exporting:

```ts
export * from './cache';
export * from './errors';
export * from './files';
```

### Named Exports Only

Always use named exports, never default exports (except for stories):

```ts
// ✅ Good
export const MyComponent: FC<Props> = memo(function MyComponent() { ... });
export function myFunction() { ... }

// ❌ Avoid
export default function MyComponent() { ... }
```

Exception: Storybook meta must be default export:

```ts
export default meta;
```

## Logging

### Console Logging Pattern

Use structured logging with context:

```ts
console.log('[APP] Starting Electron', {
    isDev,
    appPath,
    useStaticInDev,
});

console.log('[APP] Static Server', fileUrl, '->', filePath);
```

### Debug Levels

Use numeric debug levels for conditional logging:

```ts
public debug: number = 0, // 0 - none, 1 - general messages, 2 - sub/unsub, 3 - transport

if (this.debug >= 2) console.log('Stop listening', this.info, this);
```

## Spread Patterns

### Props Spreading

Collect remaining props with `...props` and spread them:

```tsx
export const Cmp: FC<CmpProps> = memo(function Cmp({ foo, className = '', ...props }) {
    return (
        <div {...props} className={`base-class ${className}`}>
            {foo}
        </div>
    );
});
```

### Object Merging

Use spread for merging with defaults:

```ts
const containerDefaultProps = offcanvas ? { style: { maxWidth: '85%' } } : {};
<Container {...{ ...containerDefaultProps, ...containerProps }} show={show} />
```

## Conditional Patterns

### Optional Chaining

Use optional chaining liberally:

```ts
onClose?.();
this.responders?.[message]?.[RESPONDER]
options?.signal?.addEventListener('abort', ...)
```

### Nullish Coalescing

Use `??` for null/undefined defaults:

```ts
const id = id ?? parent?.id;
```

### Short-circuit Evaluation

Use `&&` for conditional execution:

```ts
if (has) this.dispose(val, key);
rememberBounds && mainWindow && store.set('bounds', mainWindow.getBounds());
```
