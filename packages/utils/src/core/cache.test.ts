import { expect, describe, test, vi } from 'vitest';
import { ANY, MaybePromise, memo, TransformerMap } from './cache';

describe('memo', async () => {
    test('simple', async () => {
        const random = vi.fn(() => Math.random());
        const memoized = memo(random);

        const first = await memoized();
        const second = await memoized();

        expect(first.hit).toBeFalsy();
        expect(second.hit).toBeTruthy();
        expect(first.value).toBe(second.value);
        expect(memoized.size()).toBe(1);

        memoized.clear();
        expect(memoized.size()).toBe(0);

        const third = await memoized();
        expect(third.hit).toBeFalsy();
    });

    test('with key', async () => {
        const random = vi.fn((arg) => arg + Math.random().toString());
        const memoized = memo(random);

        const first = await memoized(1);
        const second = await memoized(2);

        expect(first.hit).toBeFalsy();
        expect(second.hit).toBeFalsy();
        expect(first.value).not.toBe(second.value);
        expect(memoized.size()).toBe(2);

        const first2 = await memoized(1);
        const second2 = await memoized(2);

        expect(first2.hit).toBeTruthy();
        expect(first.value).toBe(first2.value);
        expect(second2.hit).toBeTruthy();
        expect(second.value).toBe(second2.value);

        memoized.clear(1);
        expect(memoized.size()).toBe(1);
        memoized.clear(ANY);
        expect(memoized.size()).toBe(0);
    });
});

describe('TransformerMap', async () => {
    test('simple', async () => {
        const dispose = vi.fn();

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

        const obj = { a: 1 };

        const x1 = await cache.memo(1, obj);
        expect(x1).toStrictEqual({ a: 1, cached: true, read: 0 });

        const x2 = await cache.memo(1, obj);
        expect(x2).toStrictEqual({ a: 1, cached: true, read: 1 });

        const x3 = await cache.memo(1, { a: 2 });
        expect(x3).toStrictEqual({ a: 2, cached: true, read: 0 });
        expect(cache.size).toEqual(1);
        expect(dispose).toBeCalledTimes(1);
        expect(dispose).toBeCalledWith({ a: 1, cached: true, read: 1 }, 1);

        const x4 = await cache.memo(2, { a: 20 });

        expect(x4).toStrictEqual({ a: 20, cached: true, read: 0 });
        expect(cache.size).toEqual(2);
        expect(dispose).toBeCalledTimes(1);
    });

    test('key transform', async () => {
        const dispose = vi.fn();

        class Cache extends TransformerMap<number, any> {
            write(key, value, oldValue) {
                return { key, read: 0 };
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

        const x1 = await cache.memo(1);
        expect(x1).toStrictEqual({ key: 1, read: 0 });

        const x2 = await cache.memo(1);
        expect(x2).toStrictEqual({ key: 1, read: 1 });

        cache.clear();
        expect(dispose).toBeCalledTimes(1);
        expect(dispose).toBeCalledWith({ key: 1, read: 1 }, 1);
    });
});
