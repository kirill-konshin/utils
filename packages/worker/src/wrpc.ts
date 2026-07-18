import { getTransferrable } from './workerUtils';

// Types

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
} & any;

export enum LogLevel {
    disabled = 0,
    error = 1,
    lifecycle = 2,
    detail = 3,
    transport = 4,
}

// Helpers

export function deriveController(signal?: AbortSignal): [AbortController, AbortSignal] {
    const controller = new AbortController();
    return [controller, AbortSignal.any([controller.signal, signal].filter(Boolean) as AbortSignal[])];
}

export function rejectOnSignal(promise: Promise<any>, signal: AbortSignal): Promise<Event['data']> {
    if (signal.aborted) return Promise.reject('RaceAborted:' + signal.reason);
    return Promise.race([
        promise,
        new Promise((resolve, reject) => {
            /*
             * NOTE: no { signal } disposal here — abort algorithms (which remove signal-disposed
             * listeners) run BEFORE the abort event is dispatched, so a listener disposed by the very
             * signal it listens to would be removed without ever firing. { once } self-removes on fire.
             */
            signal.addEventListener('abort', () => reject('RaceAborted:' + signal.reason), { once: true });
        }),
    ]);
}

/*
 * Names that must never be used as responder method names: `then`/`catch`/`finally` would make the
 * caller thenable (`await caller` would dispatch a bogus RPC), and `toJSON`/`toString`/`constructor`
 * must keep resolving to the plain-object natives so the caller stays introspectable.
 */
export const RESERVED_NAMES: string[] = ['then', 'catch', 'finally', 'toJSON', 'toString', 'constructor'];

function validateResponders(responders: Responders) {
    for (const key of Object.keys(responders)) {
        if (RESERVED_NAMES.includes(key)) throw new Error(`Responder name "${key}" is reserved`);
    }
}

// Lib

export function wrpc({
    debug = LogLevel.disabled,
    name = (globalThis as any).importScripts ? 'RESPONDER' : 'CALLER',
}: {
    debug?: LogLevel;
    name?: string;
} = {}): {
    createResponder: <T extends Responders>(
        worker: WorkerLike,
        responders: T,
    ) => {
        responders: T;
        stop: () => void;
    };
    createCaller: <T extends Responders>(worker: WorkerLike, responders: T) => T;
} {
    // Logger

    function logger(type: string) {
        return (level: number, ctx: Context | null, ...args: any[]) => {
            if (!debug || debug < level) return;
            const { id, message, ...restCtx } = ctx ?? {};
            console[type](name, message ?? '*', id ?? '*', ...args, restCtx);
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

    //TODO Listener error handling
    function listen(
        worker: WorkerLike,
        context: Context | null,
        listener: (event: Event['data']) => void,
        signal: AbortSignal,
        once: boolean = false,
    ) {
        // no { signal } disposal — see the note in rejectOnSignal; { once } self-removes on fire
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

        return new Promise<Event['data']>((resolve) =>
            listen(
                worker,
                ctx,
                (data) => {
                    if (!condition(data)) return;
                    waitController.abort('WaitFinished');
                    resolve(data);
                },
                waitSignal,
            ),
        );
    }

    // Responder

    //TODO Name arg
    function createResponder<T extends Responders>(
        worker: WorkerLike,
        responders: T,
    ): {
        responders: T;
        stop: () => void;
    } {
        validateResponders(responders);

        const mainController = new AbortController();

        worker.addEventListener('messageerror', (e) => logError(LogLevel.error, null, 'MESSAGE ERROR', e), {
            signal: mainController.signal,
        });

        listen(
            worker,
            null,
            async ({ ctx, payload = {} }) => {
                if (!ctx?.message || !ctx.id || ctx.abort || ctx.ack) return; // ignore invalid and service messages
                try {
                    const responder = responders[ctx.message];

                    if (!responder) throw new Error('Unknown responder', { cause: ctx });

                    const [subController, subSignal] = deriveController(mainController.signal);

                    // always recover signal so that promises also can abort
                    if (ctx.signalName) payload[ctx.signalName] = subSignal;

                    const iterator = responder.call(responders, payload); // no await! `.call` so responders can use `this`

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

                    let res: any;
                    try {
                        /*
                         * Listen outside the loop to react immediately
                         * Could be a wait for since abort is a one-off, but listeners are disposed by signal anyway, and we don't need to block the async thread
                         */
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

                        let nextPayload: any = payload; // does not matter, will be ignored anyway
                        do {
                            res = await rejectOnSignal(iterator.next(nextPayload), subSignal);

                            send(worker, { ...ctx, done: res.done }, res.value);

                            if (res.done) {
                                subController.abort('Done');
                                break;
                            }

                            const nextData = await rejectOnSignal(
                                waitFor(worker, ctx, (data) => !!data.ctx.ack, subSignal),
                                subSignal,
                            );
                            nextPayload = nextData.payload;

                            log(LogLevel.detail, ctx, 'LOOP ACK');
                        } while (!res.done && !subSignal.aborted);
                    } catch (e) {
                        if (!subSignal.aborted && !e.message.includes('RaceAborted')) {
                            logError(LogLevel.error, ctx, 'LOOP ERROR', e);
                            send(worker, { ...ctx, error: true, done: true }, e);
                        }
                    } finally {
                        /*
                         * Run the generator's own finally/cleanup when the loop ended early (abort, break,
                         * error). Best-effort, not awaited: if the generator is suspended on an await that
                         * never settles, the queued return() never executes — cooperative cancellation via
                         * the recovered AbortSignal remains the responder's own job.
                         */
                        if (!res?.done) {
                            try {
                                void Promise.resolve(iterator.return?.(undefined)).catch(() => {});
                            } catch {
                                // sync generator threw during cleanup
                            }
                        }
                        log(LogLevel.detail, ctx, 'LOOP DONE');
                    }
                } catch (e) {
                    // Generator-specific error handling
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
    function createCaller<T extends Responders>(worker: WorkerLike, responders: T): T {
        validateResponders(responders);

        worker.addEventListener('messageerror', (e) => logError(LogLevel.error, null, 'MESSAGE ERROR', e));

        //TODO Stop

        return new Proxy<T>(responders as any, {
            get(target, prop, receiver) {
                /*
                 * Reserved names and symbols fall through to the plain object: `then` stays undefined so
                 * the caller is not thenable (`await caller` would otherwise dispatch a bogus RPC), and
                 * `toString`/`constructor` resolve to the inherited natives so the caller can be
                 * introspected. validateResponders() forbids creating responders with these names.
                 */
                if (typeof prop !== 'string' || RESERVED_NAMES.includes(prop)) {
                    return Reflect.get(target, prop, receiver);
                }

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

                    const promise = waitFor(worker, ctx, undefined, promiseSignal).then((data) => {
                        const { ctx: ctxIn, payload } = data;
                        if (ctxIn.error) {
                            logError(LogLevel.error, ctx, 'PROMISE ERROR', payload);
                            throw payload;
                        }
                        if (ctxIn.promise) {
                            log(LogLevel.lifecycle, ctx, 'PROMISE RESOLVED', payload);
                            return payload;
                        }
                        // a generator frame means the method was awaited instead of iterated
                        logError(LogLevel.error, ctx, 'ERROR', 'Cannot await a generator method', data);
                        cancel(true, 'AwaitedGenerator');
                        throw new Error('Cannot await a generator method, use `for await ... of`', {
                            cause: data,
                        });
                    });

                    /*
                     * Keep at least one rejection handler attached: the promise rejects unobserved when a
                     * generator's first frame arrives before iteration starts, or when a fire-and-forget
                     * promise call errors. Awaiters get their own branch via the bound then/catch below.
                     */
                    promise.catch(() => {});

                    async function* generator() {
                        let done = false;
                        try {
                            // React immediately (no { signal } disposal — see the note in rejectOnSignal)
                            mainSignal.addEventListener('abort', () => cancel(true, mainSignal.reason), {
                                once: true,
                            });

                            log(LogLevel.detail, ctx, 'GENERATOR START');
                            promiseController.abort('GeneratorUsed');

                            do {
                                const data = await rejectOnSignal(
                                    waitFor(worker, ctx, undefined, mainSignal),
                                    mainSignal,
                                );

                                const { ctx: ctxIn, payload: value } = data;

                                log(LogLevel.lifecycle, ctx, 'EVENT', mainSignal.aborted, ctxIn, value);

                                if (ctxIn.promise) {
                                    /*
                                     *  && !ctxIn.error
                                     * cancel(false, 'Resolved');
                                     * return payloadIn;
                                     */
                                    logError(LogLevel.error, ctx, 'ERROR', 'Unexpected promise in generator', data);
                                    throw new Error('Unexpected promise in generator', { cause: data });
                                }

                                if (ctxIn.error) {
                                    logError(LogLevel.error, ctx, 'ERROR', data);
                                    cancel(false, 'Error');
                                    throw value;
                                }

                                if (ctxIn.done) {
                                    done = true;
                                    return value;
                                } else {
                                    const nextPayload = yield value;
                                    if (!mainSignal.aborted) send(worker, { ...ctx, ack: true }, nextPayload);
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

                    /*
                     * FIXME Nasty hack, return both iterator and promise
                     * Consuming code will get both, but IDE should show only proper type
                     * Consuming code will likely use only one except someone calls `for await ... of await` which is not useful in any case
                     */
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
