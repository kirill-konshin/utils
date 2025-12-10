# TypeScript

All packages extend root `tsconfig.json`.

## Compiler Options

Key TypeScript settings used across the codebase:

- `isolatedDeclarations: true` - Enables faster declaration emit and requires explicit type annotations on exports
- `strictNullChecks: true` - Null and undefined are distinct types
- `strict: false` - Not using full strict mode, but strictNullChecks is enabled
- `moduleResolution: "bundler"` - Modern bundler-compatible resolution
- `jsx: "react-jsx"` - Modern JSX transform (no React import needed)

## Type Annotation Patterns

### Export Types Explicitly

Due to `isolatedDeclarations`, all exported functions and variables must have explicit type annotations:

```ts
// ✅ Good - explicit return type
export const downloadFile = async (file: File): Promise<void> => { ... };

// ✅ Good - explicit type for complex objects
export const colored: {
    important: typeof bold;
    subject: typeof magenta;
} = { ... };

// ❌ Bad - inferred return type on export
export const downloadFile = async (file: File) => { ... };
```

### Type Definitions

1. **Use `type` over `interface`** for props and simple types:

```ts
export type CmpProps = {
    foo: string;
    bar?: number;
};
```

2. **Use `interface` for extendable contracts**:

```ts
export interface ControlProps {
    value?: any;
    setValue?: (v: any) => void;
    name: string;
}

export interface RangeProps extends ControlProps {
    min: number;
    max: number;
}
```

### Generic Type Patterns

Use descriptive generic names and constraints:

```ts
export function memo<Key extends any[], Val, SerializedKey extends any[] = Key>(
    fn: (...args: Key) => MaybePromise<Val>,
    options: { key?: (...key: Key) => SerializedKey } = {},
): { (...args: Key): Promise<{ value?: Val; hit: boolean }> } { ... }
```

### Utility Types

Define reusable utility types at the top of files:

```ts
export type MaybePromise<T> = T | Promise<T>;
```

## Import Patterns

### Node.js Imports

Use `node:` prefix for Node.js built-in modules:

```ts
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { execSync } from 'node:child_process';
```

### Type-Only Imports

Use `import type` when importing only types (especially important for worker fixtures):

```ts
import type { responder } from './wrpc.fixture'; // DO NOT IMPORT ANYTHING OTHER THAN TYPES!!!
```

## Class Patterns

### Abstract Classes

Use abstract classes for extensible base implementations:

```ts
export abstract class TransformerMap<Key, Val = Key> extends Map<Key, Val> {
    constructor(protected readonly name: string) {
        super();
    }

    protected write(key: Key, newValue?: Val, oldValue?: Val): MaybePromise<Val> {
        return newValue as Val;
    }

    protected read(oldValue: Val, key: Key): MaybePromise<Val> {
        return oldValue;
    }

    protected dispose(value: Val, key: Key): void {}

    abstract memo(key: Key, newValue?: Val): Promise<Val>;
}
```

### Class with Generics

```ts
export class RespondersBase<R> {
    create<M extends keyof R, F extends (input: any, context: ResponseContext<R, M>) => any>(
        message: M,
        responder: F,
    ): F {
        responder[RESPONDER] = true;
        return responder as any;
    }
}
```

## Error Handling

Use the `cause` option for error context:

```ts
throw new Error('Unknown responder', { cause: ctx });
throw new Error(`Context ${obj.id} is closed (${label})`, { cause: obj });
```

## Comments

Use `//TODO`, `//FIXME` for actionable items (no space after `//`):

```ts
//TODO Implement queue with ranking & sorting
//FIXME https://github.com/eligrey/FileSaver.js/issues/471
```

Use `@ts-expect-error` with explanation when suppressing errors:

```ts
// @ts-expect-error file is always there
const [file] = e.target.files;
```
