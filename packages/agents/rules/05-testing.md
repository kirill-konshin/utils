# Testing

Testing patterns and conventions using Vitest.

## Test File Structure

### File Naming

- Test files: `*.test.ts` or `*.test.tsx`
- Fixture files: `*.fixture.ts` (for test helpers, mocks, worker fixtures)

### Import Order

```ts
import '@vitest/web-worker'; // polyfills first if needed
import { expect, describe, test, vi } from 'vitest';
import { functionToTest } from './module';
import type { TypeOnly } from './fixture'; // type-only imports for fixtures
```

## Test Organization

### describe/test Pattern

Use `describe` for grouping related tests, `test` for individual test cases:

```ts
describe('memo', async () => {
    test('simple', async () => {
        // test implementation
    });

    test('with key', async () => {
        // test implementation
    });
});
```

### Test Timeouts

Set timeouts on describe blocks for slow tests:

```ts
describe(
    'SlowOperation',
    async () => {
        // tests
    },
    { timeout: 5000 },
);
```

## Mocking

### vi.fn() for Mocks

Use `vi.fn()` for creating mock functions:

```ts
const random = vi.fn(() => Math.random());
const dispose = vi.fn();
```

### Mock Assertions

```ts
expect(dispose).toBeCalledTimes(1);
expect(dispose).toBeCalledWith({ key: 1, read: 1 }, 1);
expect(fn).nthCalledWith(1, { progress: 0 });
```

## Assertions

### Common Matchers

```ts
expect(first.hit).toBeFalsy();
expect(second.hit).toBeTruthy();
expect(first.value).toBe(second.value);
expect(first.value).not.toBe(second.value);
expect(x1).toStrictEqual({ a: 1, cached: true, read: 0 });
expect(cache.size).toEqual(1);
```

### Async Assertions

```ts
await expect(promise).resolves.toEqual({ test: 'test' });
await expect(caller.promiseError()).rejects.toThrowError('Test');
```

### Error Assertions

```ts
await expect(async () => {
    await someAsyncOperation();
}).rejects.toThrowError('Expected error message');
```

## Test Helpers

### Class Testing

Create test-specific class implementations:

```ts
class StubClass extends TargetClass {
    counter = 0;
    // make observable with custom implementation
    method(val) {
        this.counter++; // bump counter to make it observable like this
        return 123; // something predictable
    }
    method2 = vi.fn(TargetClass.prototype.method2); // make observable with original implementation
    method3 = vi.fn(); // make observable with no implementation
}

const cache = new Cache('test');
```

### Factory Functions for Test Setup

Create helper functions for common setup:

```ts
const createTestInstance = () => {
    const instance = new MyClass();
    instance.addEventListener('error', (e) => console.error('Error', e));
    return instance;
};
```

## Skipping Tests

Use `test.skip` for temporarily disabled tests:

```ts
test.skip('feature not yet implemented', async () => {
    // test implementation
});
```

## Worker Testing

### Web Worker Polyfill

```ts
import '@vitest/web-worker';
```
