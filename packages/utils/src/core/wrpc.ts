import { getTransferrable } from './worker';

export function deriveController(signal?: AbortSignal): [AbortController, AbortSignal] {
    const controller = new AbortController();
    return [controller, AbortSignal.any([controller.signal, signal].filter(Boolean) as AbortSignal[])];
}

export function rejectOnSignal(promise: Promise<any>, signal?: AbortSignal) {
    return Promise.race([
        promise,
        new Promise<Event['data']>((resolve, reject) => {
            signal?.addEventListener('abort', () => reject('RaceAborted:' + signal.reason), { once: true, signal }); //TODO Maybe signal is not needed
        }),
    ]);
}

export type Responders = { [key: string]: (arg?: any) => Generator<any> | AsyncGenerator<any> | Promise<any> | any };

export type Context = {
    message: string;
    id: string;
    signalName?: string;
    done?: boolean;
    abort?: string;
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
    // console.log('SEND', (worker as any).self ? 'WORKER' : 'MAIN', ctx, payload);
    worker.postMessage({ ctx, payload }, getTransferrable(payload));
}

function listen(
    worker: WorkerLike,
    context: Context | null,
    listener: (event: Event['data']) => void,
    signal: AbortSignal,
    once: boolean = false,
) {
    worker.addEventListener(
        'message',
        ({ data }: Event) =>
            // no context = listen all, or matching context
            (!context || (data?.ctx?.message === context.message && data.ctx?.id === context.id)) && listener(data),
        { signal, once },
    );
}

function waitFor(
    worker: WorkerLike,
    ctx: Context,
    condition: (data: Event['data']) => boolean = (data) => true,
    signal: AbortSignal,
) {
    const [waitController, waitSignal] = deriveController(signal);

    return new Promise<Event['data']>((res) => {
        listen(
            worker,
            ctx,
            (data) => {
                if (!condition(data)) return;
                waitController.abort('WaitFinished');
                res(data);
            },
            waitSignal,
            true,
        );
    });
}

export function createResponder<T extends Responders>(worker: WorkerLike, responders: T, debug = false) {
    const mainController = new AbortController();

    listen(
        worker,
        null,
        async ({ ctx, payload = {} }) => {
            try {
                if (!ctx || !ctx.message || !ctx.id || ctx.abort || ctx.ack) return; // ignore invalid and service messages

                const responder = responders[ctx.message];

                if (!responder) throw new Error('Unknown responder', { cause: ctx });

                const [subController, subSignal] = deriveController(mainController.signal);

                // always recover signal so that promises also can abort
                if (ctx.signalName) payload[ctx.signalName] = subSignal;

                // Function, AsyncFunction
                const isGenerator =
                    responder.constructor.name === 'GeneratorFunction' ||
                    responder.constructor.name === 'AsyncGeneratorFunction';

                if (debug) console.log('RESPONDER START', ctx, isGenerator, responder.constructor.name);

                // PROMISE

                if (!isGenerator) {
                    // Errors are caught in generic handler
                    send(worker, { ...ctx, promise: true }, await rejectOnSignal(responder(payload), subSignal));
                    if (debug) console.log('RESPONDER RESOLVED');
                    return;
                }

                // GENERATOR

                // Generator-specific error handling
                try {
                    // Listen outside the loop to react immediately
                    listen(
                        worker,
                        ctx,
                        (data) => {
                            if (!data.ctx.abort) return;
                            subController.abort(data.ctx.abort);
                            if (debug) console.log('RESPONDER GOT ABORT', data.ctx.abort, ctx);
                        },
                        subSignal,
                    );

                    let res: any;
                    const iterator = responder(payload);
                    do {
                        res = await rejectOnSignal(iterator.next(), subSignal);

                        send(worker, { ...ctx, done: res.done }, res.value);

                        if (res.done) {
                            subController.abort('Done');
                            break;
                        }

                        await rejectOnSignal(
                            waitFor(worker, ctx, (data) => !!data.ctx.ack, subSignal),
                            subSignal,
                        );

                        if (debug) console.log('RESPONDER ACK');
                    } while (!res.done && !subSignal.aborted);
                } catch (e) {
                    if (!subSignal.aborted && !e.message.includes('RaceAborted')) {
                        if (debug) console.error('RESPONDER ERROR', e);
                        send(worker, { ...ctx, error: true, done: true }, e);
                    }
                } finally {
                    if (debug) console.info('RESPONDER LOOP DONE');
                }
            } catch (e) {
                if (debug) console.error('RESPONDER ERROR', e);
                send(worker, { ...ctx, error: true, promise: true }, e); // Generic error handling responds as promise
            } finally {
                if (debug) console.info('RESPONDER DONE');
            }
        },
        mainController.signal,
    );

    function stop() {
        mainController.abort('Stop');
    }

    return { responders, stop }; // responders needed for typing
}

export function createCaller<T extends Responders>(worker: WorkerLike, responders: T, debug = false): T {
    return new Proxy<T>(responders as any, {
        get(target, prop, receiver) {
            function gen(payload: any) {
                const ctx = { message: prop.toString(), id: crypto.randomUUID() } as Context;

                let signal: AbortSignal = null as any;

                if (payload && Object.is(payload, Object(payload))) {
                    for (const [key, value] of Object.entries(payload)) {
                        if (value instanceof AbortSignal) {
                            if (debug) console.log('CALLER FOUND SIGNAL', key);
                            ctx.signalName = key;
                            signal = value;
                        }
                    }
                }

                const [mainController, mainSignal] = deriveController(signal);

                const cancel = (notify: boolean, reason: string = '') => {
                    if (mainController.signal.aborted) return;
                    if (debug) console.log('CALLER CANCEL', reason, notify);
                    if (reason) mainController.abort(reason); // stop listening
                    if (notify) send(worker, { ...ctx, abort: reason }); // worker will break & acknowledge, but it's not important
                };

                // Generator

                const [promiseController, promiseSignal] = deriveController(mainSignal);

                const promise = waitFor(worker, ctx, (data) => !!data.ctx.promise, promiseSignal).then(
                    ({ ctx, payload }) => {
                        if (ctx.error) throw payload;
                        return payload;
                    },
                );

                async function* generator() {
                    let done = false;
                    try {
                        // React immediately
                        mainSignal.addEventListener(
                            'abort',
                            () => cancel(true, mainSignal.reason),
                            { once: true, signal: mainSignal }, //TODO Maybe signal is not needed
                        );

                        if (debug) console.log('CALLER GENERATOR START');
                        promiseController.abort('GeneratorUsed');

                        do {
                            const data = await rejectOnSignal(waitFor(worker, ctx, undefined, mainSignal), mainSignal);

                            const { ctx: ctxIn, payload: payloadIn } = data;

                            if (debug) console.log('CALLER EVENT', mainSignal.aborted, ctxIn, payloadIn);

                            if (ctxIn.promise) {
                                //  && !ctxIn.error
                                // cancel(false, 'Resolved');
                                // return payloadIn;
                                throw new Error('Unexpected promise in generator');
                            }

                            if (ctxIn.error) {
                                // console.log('CALLER ERROR', res.data);
                                cancel(false, 'Error');
                                throw payloadIn;
                            }

                            if (ctxIn.done) {
                                done = true;
                                return payloadIn;
                            } else {
                                yield payloadIn;
                                if (!mainSignal.aborted) send(worker, { ...ctx, ack: true });
                            }
                        } while (!mainSignal.aborted);
                    } finally {
                        // prevent further cycles in worker once main is closed/cancelled/aborted
                        if (debug) console.log('CALLER DONE');
                        cancel(true, mainSignal.aborted ? mainSignal.reason : done ? 'Done' : 'Break');
                    }
                }

                const iterator = generator();

                send(worker, ctx, payload);

                // FIXME Nasty hack, return both iterator and promise
                // Consuming code will get both, but IDE should show only proper type
                // Consuming code will likely use only one except someone calls `for await ... of await` which is not useful in any case
                iterator['then'] = promise.then.bind(promise);
                iterator['catch'] = promise.catch.bind(promise);
                iterator['finally'] = promise.finally.bind(promise);
                return iterator;
            }

            //TODO mimic-function(gen, fn); but no access to original
            Object.defineProperty(gen, 'name', { value: prop.toString() });

            (target as any)[prop] = gen; // so that fn is visible after use, maybe not needed

            return gen;
        },
    }) as T;
}
