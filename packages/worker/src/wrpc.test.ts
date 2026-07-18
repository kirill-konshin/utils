import '@vitest/web-worker';

import { describe, expect, test, vi } from 'vitest';

import { wrpc } from './wrpc';
import type { responder } from './wrpc.fixture'; // DO NOT IMPORT ANYTHING OTHER THAN TYPES!!!

// Prepare

/*
 * For tests that never exchange messages (proxy shape, creation-time validation). A real Worker's
 * async boot would dangle past the test's end, and @vitest/web-worker corrupts concurrently booting
 * workers (module evaluations share the swapped-in `self` global), breaking later tests.
 */
const stubWorker = (): any => ({ addEventListener: () => {}, removeEventListener: () => {}, postMessage: () => {} });

const createWorker = () => {
    const mainWorker = new Worker(new URL('./wrpc.fixture', import.meta.url), { type: 'module' });
    mainWorker.addEventListener('error', (e) => console.error('Worker Error', e));

    const caller = wrpc().createCaller(
        mainWorker,
        {} as typeof responder.responders, // only types, object will be proxied
    );

    return { mainWorker, caller };
};

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

// Tests

describe('WRPC', async () => {
    test('for await ... of return yield', async () => {
        const { caller } = createWorker();

        const fn = vi.fn();

        for await (const data of caller.returnYield()) {
            fn(data);
            console.log('DATA', data);
            //TODO Test early return
        }

        expect(fn).nthCalledWith(1, 1);
        expect(fn).nthCalledWith(2, 2);
        expect(fn).nthCalledWith(3, 3);
        expect(fn).toBeCalledTimes(3);

        let res;
        const it = caller.returnYield();
        do {
            res = await it.next();
            console.log('DATA', res);
            fn(res);
        } while (!res.done);

        expect(fn).nthCalledWith(4, { value: 1, done: false });
        expect(fn).nthCalledWith(5, { value: 2, done: false });
        expect(fn).nthCalledWith(6, { value: 3, done: false });
        expect(fn).nthCalledWith(7, { value: undefined, done: true });
        expect(fn).toBeCalledTimes(7);
    });

    test('for await ... of separate return & yield', async () => {
        const { caller } = createWorker();

        const fn = vi.fn();

        for await (const data of caller.test()) {
            fn(data);
            console.log('DATA', data);
        }

        expect(fn).nthCalledWith(1, { progress: 0 });
        expect(fn).nthCalledWith(2, { progress: 0.5 });
        expect(fn).nthCalledWith(3, { progress: 1, aborted: false });
        expect(fn).toBeCalledTimes(3);
    });

    test('do ... while', async () => {
        const { caller } = createWorker();

        const fn = vi.fn();

        let res;
        const it = caller.test();
        do {
            res = await it.next();
            console.log('DATA', res);
            fn(res);
        } while (!res.done);

        expect(fn).nthCalledWith(1, { value: { progress: 0 }, done: false });
        expect(fn).nthCalledWith(2, { value: { progress: 0.5 }, done: false });
        expect(fn).nthCalledWith(3, { value: { progress: 1, aborted: false }, done: false });
        expect(fn).nthCalledWith(4, { value: 'foo', done: true });
        expect(fn).toBeCalledTimes(4);
    });

    test('break', async () => {
        const { caller } = createWorker();

        const fn = vi.fn();

        for await (const data of caller.test()) {
            fn(data);
            console.log('DATA', data);
            break;
        }

        expect(fn).nthCalledWith(1, { progress: 0 });
        expect(fn).toBeCalledTimes(1);
    });

    test('abort', async () => {
        const { caller } = createWorker();

        const controller = new AbortController();

        const fn = vi.fn();

        for await (const data of caller.test({ signal: controller.signal })) {
            fn(data);
            console.log('DATA', data);
            controller.abort('Test');
        }

        expect(fn).nthCalledWith(1, { progress: 0 });
        expect(fn).toBeCalledTimes(1); // not guaranteed without explicit break, caller generator may receive multiple events and enqueue them while reader only reads one, so second will also be read
    });

    test('error', async () => {
        const { caller } = createWorker();

        await expect(async () => {
            for await (const data of caller.error()) {
                console.log('DATA', data);
            }
        }).rejects.toThrowError('Test');
    });

    test('unknown responder', async () => {
        const { caller } = createWorker();

        await expect(caller['unknown']()).rejects.toThrowError('Unknown responder');
    });

    test('promise', async () => {
        const { caller } = createWorker();
        const promise = caller.promise();
        await new Promise((res) => setTimeout(res, 100)); // introduce delay
        await expect(promise).resolves.toEqual({ test: 'test' });
    });

    test('promise error', async () => {
        const { caller } = createWorker();
        await expect(caller.promiseError()).rejects.toThrowError('Test');
    });

    test('promise as generator', async () => {
        const { caller } = createWorker();
        await expect(async () => {
            // @ts-expect-error deliberate issue
            for await (const data of caller.promise()) {
                console.log('DATA', data);
            }
        }).rejects.toThrowError('Unexpected promise in generator');
    });

    test('stop', async () => {
        const { caller, mainWorker } = createWorker();

        await getWorkerInfo(mainWorker, 'stop');

        const fn = vi.fn();

        await Promise.race([
            (async () => {
                for await (const data of caller.test()) {
                    fn(data);
                    console.log('DATA', data);
                }
            })(),
            new Promise((resolve) => setTimeout(resolve, 500)),
        ]);

        expect(fn).toBeCalledTimes(0);
    });

    test('bidirectional', async () => {
        const { caller } = createWorker();

        const it = caller.bidirectional(1);

        /*
         * TODO Readme
         *   > No log at this step: the first value sent through `next` is lost
         *   https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Generator/next#sending_values_to_the_generator
         */
        await expect(it.next(9)).resolves.toEqual({ value: '1.0', done: false }); // 9 is ignored as yield is not yet reached
        await expect(it.next(2)).resolves.toEqual({ value: '2.1', done: false });
        await expect(it.next(3)).resolves.toEqual({ value: '3.2', done: false });
        await expect(it.next(9)).resolves.toEqual({ value: 'done', done: true }); // 9 is ignored as generator has returned and is done
    });

    test('setTimeout & setInterval', async () => {
        const { caller } = createWorker();

        await caller.setTimeout({ timeout: 10 });
        void caller.setTimeout({ timeout: 10 }); // no await!

        let i = 0;
        for await (const data of caller.setInterval({ timeout: 10 })) {
            console.log('DATA', data);
            i++;
            if (i >= 3) break;
        }

        expect(i).toBe(3);
    });

    test('caller is not thenable', async () => {
        const caller = wrpc().createCaller(stubWorker(), {} as typeof responder.responders);

        expect((caller as any).then).toBeUndefined();
        expect((caller as any).catch).toBeUndefined();
        expect((caller as any).finally).toBeUndefined();
        await expect(Promise.resolve(caller)).resolves.toBe(caller);
    });

    test('caller is introspectable', () => {
        const caller = wrpc().createCaller(stubWorker(), {} as typeof responder.responders);

        expect((caller as any)[Symbol.asyncIterator]).toBeUndefined();
        expect((caller as any)[Symbol.iterator]).toBeUndefined();
        expect(String(caller)).toBe('[object Object]');
        expect(JSON.stringify(caller)).toBe('{}');
    });

    test('reserved responder names throw on create', () => {
        expect(() => wrpc().createCaller(stubWorker(), { then: async () => {} } as any)).toThrowError('reserved');
        expect(() => wrpc().createResponder(stubWorker(), { toJSON: async () => {} } as any)).toThrowError('reserved');
    });

    test('await generator method rejects instead of hanging', async () => {
        const { caller } = createWorker();

        await expect(caller.test()).rejects.toThrowError('Cannot await a generator method');

        // the responder loop was aborted and released — the same worker keeps serving
        const fn = vi.fn();
        for await (const data of caller.test()) fn(data);
        expect(fn).toBeCalledTimes(3);
    });

    test('await generator that throws rejects with the original error', async () => {
        const { caller } = createWorker();

        await expect(caller.error()).rejects.toThrowError('Test');
    });

    test('unawaited generator produces no unhandled rejection', async () => {
        const { caller } = createWorker();

        const onRejection = vi.fn();
        process.on('unhandledRejection', onRejection);
        try {
            void caller.test();
            await new Promise((res) => setTimeout(res, 200));
            expect(onRejection).not.toHaveBeenCalled();
        } finally {
            process.off('unhandledRejection', onRejection);
        }
    });

    test('iteration started after first frame already arrived fails loudly', async () => {
        const { caller } = createWorker();

        const it = caller.test();
        await new Promise((res) => setTimeout(res, 100)); // first frame consumed by the eager promise → cancelled
        await expect(it.next()).rejects.toMatch('RaceAborted');
    });

    test('responder generator cleanup runs on break', async () => {
        const { caller } = createWorker();

        for await (const data of caller.cleanupGen()) {
            console.log('DATA', data);
            break;
        }

        await vi.waitFor(async () => {
            expect(await caller.wasCleaned()).toBe(true);
        });
    });
});
