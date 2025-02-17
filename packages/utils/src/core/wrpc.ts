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
    ack?: boolean;
    promise?: boolean;
};

export type Event = MessageEvent<{ ctx: Context; payload: any | Error }>;

export type WorkerLike = {
    postMessage: (payload: any, transferable: any[]) => void;
    addEventListener: (
        event: string,
        listener: (e: any) => void,
        options?: { signal?: AbortSignal; once?: boolean },
    ) => void;
    removeEventListener: (event: string, listener: (e: any) => void) => void;
};

function send(worker: WorkerLike, ctx: Context, payload?: any) {
    worker.postMessage({ ctx, payload }, getTransferrable(payload)); //TODO Transeferable
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

function waitFor(worker: WorkerLike, ctx: Context, fn: (data: Event['data']) => boolean, signal?: AbortSignal) {
    return new Promise<void>((res) => {
        listen(worker, ctx, (data) => fn(data) && res(), signal, true);
    });
}

export function createResponder<T extends Responders>(worker: WorkerLike, responders: T) {
    const mainController = new AbortController();

    listen(
        worker,
        null,
        async ({ ctx, payload = {} }) => {
            if (!ctx || !ctx.message || !ctx.id || ctx.abort || ctx.ack) return; // ignore invalid ans service messages

            const responder = responders[ctx.message];

            if (!responder) return;

            const subController = new AbortController();

            // always recover signal so that promises also can abort
            if (ctx.signal) payload[ctx.signal] = subController.signal;

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
                    send(worker, { ...ctx, promise: true }, await responder(payload));
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
                //     send(worker, ctx, res.value);
                // } while (!res.done);

                for await (const res of responder(payload)) {
                    //FIXME This still lags since iterator can move on while signal is delivered
                    if (subController.signal.aborted) {
                        console.log('RESPONDER ABORT -> BREAK', subController.signal.aborted);
                        break;
                    }
                    console.log('>>> RESPONDER SEND', subController.signal.aborted, res, ctx);

                    send(worker, ctx, res);

                    await waitFor(worker, ctx, ({ ctx }) => !!ctx?.ack, subController.signal);

                    console.log('ACK');
                }
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
            function gen(payload) {
                const ctx = { message: prop.toString(), id: crypto.randomUUID() } as Context;

                let signal: AbortSignal = null as any;

                const mainController = new AbortController();

                if (payload) {
                    for (const [key, value] of Object.entries(payload)) {
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

                //TODO Optimize
                const cancel = (silent = false) => {
                    console.log('CALLER CANCEL');
                    mainController.abort('Cancel'); // stop listening, worker will acknowledge
                    if (!silent) send(worker, { ...ctx, abort: true });
                };

                let firstProcessed = false;

                const promise = Promise.withResolvers();

                let iterator: AsyncIterableIterator<Event['data']> = null as any;

                // function makeRangeIterator(start = 0, end = Infinity, step = 1) {
                //   let nextIndex = start;
                //   let iterationCount = 0;
                //
                //   const rangeIterator = {
                //     next() {
                //       let result;
                //       if (nextIndex < end) {
                //         result = { value: nextIndex, done: false };
                //         nextIndex += step;
                //         iterationCount++;
                //         return result;
                //       }
                //       return { value: iterationCount, done: true };
                //     },
                //   };
                //   return rangeIterator;
                // }

                const stream = new ReadableStream<Event['data']>({
                    start(readController) {
                        if (mainController.signal.aborted) return;

                        //TODO Optimize
                        signal?.addEventListener('abort', () => {
                            readController.close(); // force close on abort signal
                            cancel();
                        });

                        //TODO Optimize
                        const done = (reason: string) => {
                            readController.close();
                            mainController.abort(reason);
                        };

                        listen(
                            worker,
                            ctx,
                            ({ ctx: ctxIn, payload: payloadIn }) => {
                                // prevent further cycles once closed/cancelled/aborted, worker abort ack will be ignored
                                // this will leave promise pending forever
                                if (mainController.signal.aborted) return;

                                // console.log('CALLER EVENT', controller.signal.aborted, res);

                                if (!firstProcessed) {
                                    firstProcessed = true;
                                    if (ctxIn.promise) {
                                        promise[ctxIn.error ? 'reject' : 'resolve'](payloadIn);
                                        done('Resolved');
                                        return;
                                    } else {
                                        promise.resolve(iterator); // just in case
                                    }
                                }

                                if (ctxIn.error) {
                                    // console.log('CALLER ERROR', res.data);
                                    readController.error(payloadIn);
                                    cancel(true);
                                    return;
                                }

                                // normal flow
                                if (ctxIn.done) {
                                    // console.log('CALLER DONE VIA RESPONDER -> CLOSE');
                                    done('Done');
                                    return;
                                }

                                readController.enqueue(payloadIn); // can happen multiple times before for...of reaches second iteration
                            },
                            mainController.signal,
                        );
                    },
                    pull(readController) {
                        send(worker, { ...ctx, ack: true }); // acknowledge
                    },
                    // when break statement in for...of, will result in abort signal
                    cancel() {
                        // console.log('CALLER CANCEL');
                        cancel();
                    },
                });

                send(worker, ctx, payload);

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

            (target as any)[prop] = gen; // so that fn is visible after use, maybe not needed

            return gen;
        },
    }) as T;
}
