import '@vitest/web-worker';
import { expect, describe, test, vi } from 'vitest';
import { createCaller } from './wrpc';
import type { responder } from './wrpc.fixture'; // DO NOT IMPORT ANYTHING OTHER THAN TYPES!!!

// Prepare

const createWorker = () => {
    const mainWorker = new Worker(new URL('./wrpc.fixture', import.meta.url), { type: 'module' });
    mainWorker.addEventListener('error', (e) => console.error('Worker Error', e));

    const caller = createCaller(
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

describe(
    'WRPC',
    async () => {
        test('for await ... of return yield', async () => {
            const { caller } = createWorker();

            const fn = vi.fn();

            for await (const data of caller.returnYield()) {
                fn(data);
                console.log('DATA', data);
            }

            expect(fn).nthCalledWith(1, 1);
            expect(fn).nthCalledWith(2, 2);
            expect(fn).nthCalledWith(3, 3);
            expect(fn).toBeCalledTimes(3);

            let res;
            const it = caller.returnYield();
            do {
                res = await it.next(123); // value passed to next are ignored
                console.log('DATA', res);
                fn(res);
            } while (!res.done);

            expect(fn).nthCalledWith(4, { value: 1, done: false });
            expect(fn).nthCalledWith(5, { value: 2, done: false });
            expect(fn).nthCalledWith(6, { value: 3, done: false });
            expect(fn).nthCalledWith(7, { value: undefined, done: true }); // //FIXME ADD TO README https://stackoverflow.com/questions/77727664/how-to-get-returned-value-from-async-generator-when-using-for-await
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
                // @ts-ignore
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
    },
    { timeout: 1000 },
);
