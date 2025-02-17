import '@vitest/web-worker';
import { expect, describe, test, vi } from 'vitest';
import { createCaller, createResponder, WorkerLike } from './wrpc';
import type { responders } from './wrpc.fixture';

// Prepare

// class WorkerPeer extends EventEmitter implements WorkerLike {
//     peer: WorkerPeer;
//
//     setPeer(peer: WorkerPeer) {
//         this.peer = peer;
//     }
//
//     postMessage(data: any) {
//         this.peer?.emit('message', { data });
//     }
//
//     addEventListener(event: string, listener: (e: any) => void, options) {
//         this[options['once'] ? 'once' : 'on'](event, listener);
//         options?.signal?.addEventListener('abort', () => this.off(event, listener));
//     }
//
//     removeEventListener(event: string, listener: (e: any) => void) {
//         this.off(event, listener);
//     }
// }
//
// const createWorkerMock = () => {
//     const mainWorker = new WorkerPeer();
//     const worker = new WorkerPeer();
//
//     mainWorker.setPeer(worker);
//     worker.setPeer(mainWorker);
//
//     const responder = createResponder(worker, {
//     });
//
//     const caller = createCaller(mainWorker, {} as typeof responder.responders); // or typeof responder.responders
//
//     return { mainWorker, caller, worker, responder };
// };

const createWorker = () => {
    const mainWorker = new Worker(new URL('./wrpc.fixture', import.meta.url), { type: 'module' });
    mainWorker.addEventListener('error', (e) => console.error('Worker Error', e));

    const caller = createCaller(mainWorker, {} as typeof responders);

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
        test('simple', async () => {
            const { caller } = createWorker();

            const fn = vi.fn();

            for await (const data of await caller.test({ n: 3 })) {
                fn(data);
                console.log('DATA', data);
            }

            expect(fn).nthCalledWith(1, { progress: 0.3333333333333333 });
            expect(fn).nthCalledWith(2, { progress: 0.6666666666666666 });
            expect(fn).nthCalledWith(3, { progress: 1 });
            expect(fn).nthCalledWith(4, { res: [0, 1, 2], progress: 1, aborted: false });
            expect(fn).toBeCalledTimes(4);
        });

        test('break', async () => {
            const { caller } = createWorker();

            const fn = vi.fn();

            for await (const data of caller.test({ n: 3 })) {
                fn(data);
                console.log('DATA', data);
                break;
            }

            expect(fn).nthCalledWith(1, { progress: 0.3333333333333333 });
            expect(fn).toBeCalledTimes(1);
        });

        test('abort', async () => {
            const { caller } = createWorker();

            const controller = new AbortController();

            const fn = vi.fn();

            for await (const data of caller.test({ n: 3, signal: controller.signal })) {
                fn(data);
                console.log('DATA', data);
                controller.abort('Aborted');
            }

            expect(fn).nthCalledWith(1, { progress: 0.3333333333333333 });
            // expect(fn).toBeCalledTimes(1); // not guaranteed without explicit break, caller generator may receive multiple events and enqueue them while reader only reads one, so second will also be read
        });

        test('abort stable', async () => {
            const { caller } = createWorker();

            const controller = new AbortController();

            const fn = vi.fn();

            for await (const data of caller.test({ n: 3, signal: controller.signal })) {
                if (controller.signal.aborted) break; //TODO Document, ensures loop stops and ignores all queued events
                fn(data);
                console.log('DATA', data);
                controller.abort('Aborted');
            }

            expect(fn).nthCalledWith(1, { progress: 0.3333333333333333 });
            expect(fn).toBeCalledTimes(1); // guaranteed with explicit break
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

            await expect(caller.promise()).resolves.toEqual({ test: 'test' });
        });

        test('stop', async () => {
            const { caller, mainWorker } = createWorker();

            // mainWorker.postMessage({ msg: 'stop' });
            await getWorkerInfo(mainWorker, 'stop');

            const fn = vi.fn();

            await Promise.race([
                (async () => {
                    for await (const data of caller.test({ n: 3 })) {
                        fn(data);
                        console.log('DATA', data);
                    }
                })(),
                new Promise((resolve) => setTimeout(resolve, 500)),
            ]);

            expect(fn).toBeCalledTimes(0);
        });

        test('true worker', async () => {
            // // const worker = new Worker(new URL('./temp.fixture.ts', import.meta.url));
            // const worker = new Worker(new URL('./wrpc.fixture.ts', import.meta.url));
            // // worker = new MyWorker();
            //
            // await new Promise((res) => {
            //     worker.addEventListener('message', (e) => {
            //         console.log(e);
            //         // e.data equals to 'hello world'
            //         res(e.data);
            //     });
            //     worker.postMessage('hello');
            // });

            const { caller, mainWorker } = createWorker();

            console.log('xxx');

            // const info = await getWorkerInfo(mainWorker);
            // expect(info.responder).toContain('test');

            const fn = vi.fn();

            for await (const data of caller.test({ n: 3 })) {
                fn(data);
                console.log('DATA', data);
            }

            expect(fn).nthCalledWith(1, { progress: 0.3333333333333333 });
            expect(fn).nthCalledWith(2, { progress: 0.6666666666666666 });
            expect(fn).nthCalledWith(3, { progress: 1 });
            expect(fn).nthCalledWith(4, { res: [0, 1, 2], progress: 1, aborted: false });
            expect(fn).toBeCalledTimes(4);
        });
    },
    { timeout: 1000 },
);
