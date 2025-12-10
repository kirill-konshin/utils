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

### Async describe Blocks

Use `async` on describe blocks when needed:

```ts
describe('TransformerMap', async () => {
    test('simple', async () => {
        // ...
    });
});
```

### Test Timeouts

Set timeouts on describe blocks for slow tests:

```ts
describe(
    'WRPC',
    async () => {
        // tests
    },
    { timeout: 1000 },
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
await expect(it.next(2)).resolves.toEqual({ value: '2.1', done: false });
```

### Error Assertions

```ts
await expect(async () => {
    for await (const data of caller.error()) {
        console.log('DATA', data);
    }
}).rejects.toThrowError('Test');
```

## Test Helpers

### Factory Functions for Test Setup

Create helper functions for common setup:

```ts
const createWorker = () => {
    const mainWorker = new Worker(new URL('./wrpc.fixture', import.meta.url), { type: 'module' });
    mainWorker.addEventListener('error', (e) => console.error('Worker Error', e));

    const caller = wrpc().createCaller(mainWorker, {} as typeof responder.responders);

    return { mainWorker, caller };
};
```

### Promise-based Helpers

```ts
const getWorkerInfo = async (worker: Worker, msg: string): Promise<any> =>
    await new Promise((res) => {
        const controller = new AbortController();
        worker.addEventListener(
            'message',
            (e) => {
                controller.abort();
                res(e.data);
            },
            controller,
        );
        worker.postMessage({ msg });
    });
```

## Skipping Tests

Use `test.skip` for temporarily disabled tests:

```ts
test.skip('setTimeout & setInterval', async () => {
    // test implementation
});
```

## Class Testing

Create test-specific class implementations:

```ts
class Cache extends TransformerMap<number, any> {
    write(key, value, oldValue) {
        value.cached = true;
        value.read = 0;
        return value;
    }
    read(value, key) {
        value.read++;
        return value;
    }
    dispose(value, key) {
        dispose(value, key);
    }
}

const cache = new Cache('test');
```

## Worker Testing

### Type-Only Imports for Fixtures

```ts
import type { responder } from './wrpc.fixture'; // DO NOT IMPORT ANYTHING OTHER THAN TYPES!!!
```

### Web Worker Polyfill

```ts
import '@vitest/web-worker';
```

## Console Logging in Tests

Use console.log for debugging during test development:

```ts
for await (const data of caller.test()) {
    fn(data);
    console.log('DATA', data);
}
```
