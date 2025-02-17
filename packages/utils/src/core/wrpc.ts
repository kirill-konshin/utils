import { getTransferrable } from './worker';
import type { ReadableStream as RS } from 'node:stream/web';

export type Responders = { [key: string]: (arg?: any) => Generator<any> | AsyncGenerator<any> | Promise<any> | any };

export type Context = {
    message: string;
    id: string;
    signal?: string;
    done?: boolean;
    abort?: boolean;
    error?: boolean;
    promise?: boolean;
};

export type Event = MessageEvent<{ ctx: Context; data: any | Error }>;

export type WorkerLike = {
    postMessage: (data: any, transferable: any[]) => void;
    addEventListener: (
        event: string,
        listener: (e: any) => void,
        options?: { signal?: AbortSignal; once?: boolean },
    ) => void;
    removeEventListener: (event: string, listener: (e: any) => void) => void;
};

function send(worker: WorkerLike, ctx: Context, data?: any) {
    worker.postMessage({ ctx, data }, getTransferrable(data)); //TODO Transeferable
}

function listen(
    worker: WorkerLike,
    context: Context | null,
    listener: (event: Event['data']) => void,
    signal?: AbortSignal,
    once: boolean = false,
) {
    worker.addEventListener(
        'message',
        ({ data }: Event) => {
            if (context && (data?.ctx?.message !== context.message || data.ctx?.id !== context.id)) return;
            listener(data);
        },
        { signal, once },
    );
}

export function createResponder<T extends Responders>(worker: WorkerLike, responders: T) {
    const mainController = new AbortController();

    listen(
        worker,
        null,
        async ({ ctx, data = {} }) => {
            if (!ctx || !ctx.message || !ctx.id || ctx.abort) return; // ignore invalid ans service messages

            const responder = responders[ctx.message];

            if (!responder) return;

            const subController = new AbortController();

            // always recover signal so that promises also can abort
            if (ctx.signal) data[ctx.signal] = subController.signal;

            listen(
                worker,
                ctx,
                (data2) => {
                    if (!data2?.ctx?.abort) return;
                    subController.abort('Abort');
                    // console.log('RESPONDER ABORT', ctx);
                },
                subController.signal,
            );

            // Function, AsyncFunction
            const isGenerator =
                responder.constructor.name === 'GeneratorFunction' ||
                responder.constructor.name === 'AsyncGeneratorFunction';

            // console.log('>>> RESPONDER START', ctx, isGenerator, responder.constructor.name);

            // PROMISE

            if (!isGenerator) {
                try {
                    send(worker, { ...ctx, promise: true }, await responder(data));
                } catch (e) {
                    send(worker, { ...ctx, promise: true, error: true }, e);
                }
            }

            // GENERATOR

            try {
                // NOT NEEDED, sync generators work just fine as is
                // if (syncGenerator){
                // const iterator = responder(data);
                // let res;
                // do {
                //     res = iterator.next();
                //     console.log('>>> RESPONDER SEND', res);
                //     send(worker, { ...ctx, done: res.done }, res.value);
                // } while (!res.done && !ctrl.signal.aborted);
                // }

                //FIXME for...of swallows return, but this might be expected
                // let res;
                // const it = responder(data);
                // do {
                //     res = await it.next();
                for await (const res of responder(data)) {
                    //FIXME This still lags since iterator can move on while signal is delivered
                    if (subController.signal.aborted) {
                        console.log('RESPONDER ABORT -> BREAK', subController.signal.aborted);
                        break;
                    }
                    console.log('>>> RESPONDER SEND', subController.signal.aborted, res, ctx);
                    send(worker, ctx, res);
                    // send(worker, ctx, res.value);
                }
                // } while (!res.done);
            } catch (e) {
                // console.error('>>> RESPONDER ERROR', e);
                send(worker, { ...ctx, error: true }, e);
            }

            // console.warn('>>> RESPONDER DONE');
            send(worker, { ...ctx, done: true });

            if (!subController.signal.aborted) subController.abort('Done'); // stop listening
        },
        mainController.signal,
    );

    function stop() {
        mainController.abort('Stop');
    }

    return { responders, stop }; // responders needed for typing
}

export function createCaller<T extends Responders>(worker: WorkerLike, responders: T): T {
    return new Proxy<T>(responders as any, {
        get(target, prop, receiver) {
            function gen(data) {
                const ctx = { message: prop.toString(), id: crypto.randomUUID() } as Context;

                let signal: AbortSignal = null as any;

                const controller = new AbortController();

                if (data) {
                    for (const [key, value] of Object.entries(data)) {
                        if (value instanceof AbortSignal) {
                            ctx.signal = key;
                            signal = value;
                            // console.log('CALLER FOUND SIGNAL', key);
                        }
                    }
                }

                //FIXME Need to explicitly mark generators/promises
                // Main code does not have access to anything other than types from worker
                // We can use something like `if (self) createResponder(self, { ... });` in worker and export, but it can drag unwanted code into main if tree-shaking fails
                // See below commented first-value approach
                // if (!generators[prop as any]) {
                //     const promise = Promise.withResolvers();
                //     listen(
                //         worker,
                //         ctx,
                //         (res) => {
                //             console.log('FIRST VALUE PROMISE');
                //             promise[res.ctx.error ? 'reject' : 'resolve'](res.data);
                //             controller.abort('Resolved');
                //         },
                //         signal,
                //         true,
                //     );
                //     send(worker, ctx, data);
                //     return promise.promise;
                // }

                const cancel = (silent = false) => {
                    console.log('CALLER CANCEL');
                    controller.abort('Cancel'); // stop listening, worker will acknowledge
                    if (!silent) send(worker, { ...ctx, abort: true });
                };

                let firstProcessed = false;

                const promise = Promise.withResolvers();

                let iterator: AsyncIterableIterator<Event['data']> = null as any;

                const stream = new ReadableStream<Event['data']>({
                    start(ctrl) {
                        if (controller.signal.aborted) return;

                        signal?.addEventListener('abort', () => {
                            ctrl.close(); // force close on abort signal
                            cancel();
                        });

                        const done = (reason: string) => {
                            ctrl.close();
                            controller.abort(reason);
                        };

                        listen(
                            worker,
                            ctx,
                            (res) => {
                                // prevent further cycles once closed/cancelled/aborted, worker abort ack will be ignored
                                // this will leave promise pending forever
                                if (controller.signal.aborted) return;

                                // console.log('CALLER EVENT', controller.signal.aborted, res);

                                if (!firstProcessed) {
                                    firstProcessed = true;
                                    if (res.ctx.promise) {
                                        promise[res.ctx.error ? 'reject' : 'resolve'](res.data);
                                        done('Resolved');
                                        return;
                                    } else {
                                        promise.resolve(iterator); // just in case
                                    }
                                }

                                if (res.ctx?.error) {
                                    // console.log('CALLER ERROR', res.data);
                                    ctrl.error(res.data);
                                    cancel(true);
                                    return;
                                }

                                // normal flow
                                if (res.ctx?.done) {
                                    // console.log('CALLER DONE VIA RESPONDER -> CLOSE');
                                    done('Done');
                                    return;
                                }

                                ctrl.enqueue(res.data); // can happen multiple times before for...of reaches second iteration
                            },
                            controller.signal,
                        );
                    },
                    // when break statement in for...of, will result in abort signal
                    cancel() {
                        // console.log('CALLER CANCEL');
                        cancel();
                    },
                });

                send(worker, ctx, data);

                iterator = (stream as RS).values(); // stream['values']() or stream[Symbol.asyncIterator]()

                // This forces `for await (const x of __await__ caller.x()) {}`
                // return promise.promise;

                // FIXME Nasty hack, return both iterator and promise
                //  Consuming code will get all, but IDE should show only proper type
                return {
                    ...iterator,
                    then: promise.promise.then.bind(promise.promise),
                    catch: promise.promise.catch.bind(promise.promise),
                    finally: promise.promise.finally.bind(promise.promise),
                };
            }

            //TODO mimic-function(gen, fn); but no access to original
            Object.defineProperty(gen, 'name', { value: prop.toString() });

            return gen;
        },
    }) as T;
}
