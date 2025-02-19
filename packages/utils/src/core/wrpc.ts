import { getTransferrable } from './worker';

export function deriveController(signal?: AbortSignal): [AbortController, AbortSignal] {
    const controller = new AbortController();
    return [controller, AbortSignal.any([controller.signal, signal].filter(Boolean) as AbortSignal[])];
}

export function rejectOnSignal(promise: Promise<any>, signal?: AbortSignal) {
    return Promise.race([
        promise,
        new Promise<Event['data']>((resolve, reject) => {
            signal?.addEventListener('abort', () => reject('RaceAborted:' + signal.reason), { once: true, signal });
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

export enum LogLevel {
    disabled = 0,
    error = 1,
    lifecycle = 2,
    detail = 3,
    transport = 4,
}

export function wrpc({
    debug = LogLevel.disabled,
    name = (globalThis as any).importScripts ? 'RESPONDER' : 'CALLER',
} = {}) {
    // Logger

    function logger(type: string) {
        return (level: number, ctx: Context | null, ...args: any[]) => {
            if (!debug || debug < level) return;
            const { id, message, ...restCtx } = ctx || {};
            console[type](name, message || '*', id || '*', ...args, restCtx);
        };
    }

    const log = logger('log');
    const logWarn = logger('warn');
    const logError = logger('error');

    // Service

    function send(worker: WorkerLike, ctx: Context, payload?: any) {
        log(LogLevel.transport, ctx, 'SEND', payload, typeof payload);
        worker.postMessage({ ctx, payload }, getTransferrable(payload));
    }

    function listen(
        worker: WorkerLike,
        context: Context | null,
        listener: (event: Event['data']) => void,
        signal: AbortSignal,
        once: boolean = false,
    ) {
        signal.addEventListener(
            'abort',
            () => logWarn(LogLevel.detail, context, 'LISTEN SIGNAL ABORT', signal.reason),
            {
                once: true,
            },
        );
        worker.addEventListener(
            'message',
            ({ data }: Event) => {
                log(LogLevel.transport, context, 'LISTEN EVENT', data);
                // no context = listen all, or matching context
                if (!context || (data?.ctx?.message === context.message && data.ctx?.id === context.id)) listener(data);
            },
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
            );
        });
    }

    // Responder

    //TODO Name arg
    function createResponder<T extends Responders>(worker: WorkerLike, responders: T, debug = 0) {
        const mainController = new AbortController();

        worker.addEventListener('messageerror', (e) => logError(LogLevel.error, null, 'MESSAGE ERROR', e), {
            signal: mainController.signal,
        });

        listen(
            worker,
            null,
            async ({ ctx, payload = {} }) => {
                if (!ctx || !ctx.message || !ctx.id || ctx.abort || ctx.ack) return; // ignore invalid and service messages
                try {
                    const responder = responders[ctx.message];

                    if (!responder) throw new Error('Unknown responder', { cause: ctx });

                    const [subController, subSignal] = deriveController(mainController.signal);

                    // always recover signal so that promises also can abort
                    if (ctx.signalName) payload[ctx.signalName] = subSignal;

                    const iterator = responder(payload); // no await!

                    log(LogLevel.lifecycle, ctx, 'START', iterator);

                    // PROMISE

                    // https://stackoverflow.com/a/19660350/5125659 the only right way is to call function and see what it returned
                    if (!iterator[Symbol.asyncIterator] && !iterator[Symbol.iterator]) {
                        // Errors are caught in generic handler
                        send(worker, { ...ctx, promise: true }, await rejectOnSignal(iterator, subSignal));
                        log(LogLevel.detail, ctx, 'PROMISE RESOLVED');
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
                                logWarn(LogLevel.lifecycle, ctx, 'GOT ABORT');
                            },
                            subSignal,
                        );

                        let res: any;
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

                            log(LogLevel.detail, ctx, 'LOOP ACK');
                        } while (!res.done && !subSignal.aborted);
                    } catch (e) {
                        if (!subSignal.aborted && !e.message.includes('RaceAborted')) {
                            logError(LogLevel.error, ctx, 'LOOP ERROR', e);
                            send(worker, { ...ctx, error: true, done: true }, e);
                        }
                    } finally {
                        log(LogLevel.detail, ctx, 'LOOP DONE');
                    }
                } catch (e) {
                    logError(LogLevel.error, ctx, 'ERROR', e);
                    send(worker, { ...ctx, error: true, done: true }, e); // Generic error handling
                } finally {
                    log(LogLevel.detail, ctx, 'DONE');
                }
            },
            mainController.signal,
        );

        function stop() {
            mainController.abort('Stop');
        }

        return { responders, stop }; // responders needed for typing
    }

    // Caller

    //TODO Name arg
    function createCaller<T extends Responders>(worker: WorkerLike, responders: T, debug = 0): T {
        worker.addEventListener('messageerror', (e) => logError(LogLevel.error, null, 'MESSAGE ERROR', e));

        //TODO Stop

        return new Proxy<T>(responders as any, {
            get(target, prop, receiver) {
                function gen(payload: any) {
                    const ctx: Context = { message: prop.toString(), id: crypto.randomUUID() };

                    let signal: AbortSignal = null as any;

                    if (payload && Object.is(payload, Object(payload))) {
                        for (const [key, value] of Object.entries(payload)) {
                            if (value instanceof AbortSignal) {
                                log(LogLevel.detail, ctx, 'FOUND SIGNAL', key);
                                ctx.signalName = key;
                                signal = value;
                                payload[key] = null; // will be recovered in responder
                            }
                        }
                    }

                    const [mainController, mainSignal] = deriveController(signal);

                    const cancel = (notify: boolean, reason: string = '') => {
                        if (mainController.signal.aborted) return;
                        logWarn(LogLevel.lifecycle, ctx, 'CANCEL', reason, notify);
                        if (reason) mainController.abort(reason); // stop listening
                        if (notify) send(worker, { ...ctx, abort: reason }); // worker will break & acknowledge, but it's not important
                    };

                    // Generator

                    const [promiseController, promiseSignal] = deriveController(mainSignal);

                    const promise = waitFor(
                        worker,
                        ctx,
                        (data) => !!data.ctx.promise || !!data.ctx.error,
                        promiseSignal,
                    ).then(({ ctx, payload }) => {
                        if (ctx.error) {
                            logError(LogLevel.error, ctx, 'PROMISE ERROR', payload);
                            throw payload;
                        }
                        log(LogLevel.lifecycle, ctx, 'PROMISE RESOLVED', payload);
                        return payload;
                    });

                    async function* generator() {
                        let done = false;
                        try {
                            // React immediately
                            mainSignal.addEventListener('abort', () => cancel(true, mainSignal.reason), {
                                once: true,
                                signal: mainSignal,
                            });

                            log(LogLevel.detail, ctx, 'GENERATOR START');
                            promiseController.abort('GeneratorUsed');

                            do {
                                const data = await rejectOnSignal(
                                    waitFor(worker, ctx, undefined, mainSignal),
                                    mainSignal,
                                );

                                const { ctx: ctxIn, payload: payloadIn } = data;

                                log(LogLevel.lifecycle, ctx, 'EVENT', mainSignal.aborted, ctxIn, payloadIn);

                                if (ctxIn.promise) {
                                    //  && !ctxIn.error
                                    // cancel(false, 'Resolved');
                                    // return payloadIn;
                                    logError(LogLevel.error, ctx, 'ERROR', 'Unexpected promise in generator', data);
                                    throw new Error('Unexpected promise in generator', { cause: data });
                                }

                                if (ctxIn.error) {
                                    logError(debug, ctx, 'ERROR', data);
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
                            log(LogLevel.detail, ctx, 'DONE');
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

    return { createResponder, createCaller };
}
