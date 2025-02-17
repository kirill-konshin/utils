import { getTransferrable } from './worker';

export function makeAbortController(signal?: AbortSignal): [AbortController, AbortSignal] {
    const controller = new AbortController();
    return [controller, AbortSignal.any([controller.signal, signal].filter(Boolean) as AbortSignal[])];
}

export function rejectOnSignal(promise: Promise<any>, signal?: AbortSignal) {
    return Promise.race([
        promise,
        new Promise<Event['data']>((resolve, reject) => {
            signal?.addEventListener('abort', () => reject('RaceAborted:' + signal.reason), { once: true });
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
    console.log('SEND', (worker as any).self ? 'WORKER' : 'MAIN', ctx, payload);
    worker.postMessage({ ctx, payload }, getTransferrable(payload)); //TODO Transeferable
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
        ({ data }: Event) => {
            if (context && (data?.ctx?.message !== context.message || data.ctx?.id !== context.id)) return;
            listener(data);
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
    const [controller, innerSignal] = makeAbortController(signal);

    return new Promise<Event['data']>((res) => {
        listen(
            worker,
            ctx,
            (data) => {
                if (!condition(data)) return;
                res(data);
                controller.abort('WaitFinished');
            },
            innerSignal,
        );
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

            const [subController, subSignal] = makeAbortController(mainController.signal);

            // always recover signal so that promises also can abort
            if (ctx.signalName) payload[ctx.signalName] = subController.signal;

            // Function, AsyncFunction
            const isGenerator =
                responder.constructor.name === 'GeneratorFunction' ||
                responder.constructor.name === 'AsyncGeneratorFunction';

            console.log('RESPONDER START', ctx, isGenerator, responder.constructor.name);

            // PROMISE

            if (!isGenerator) {
                try {
                    send(worker, { ...ctx, promise: true }, await rejectOnSignal(responder(payload), subSignal));
                    console.log('RESPONDER RESOLVED');
                } catch (e) {
                    console.error('RESPONDER REJECTED', e);
                    send(worker, { ...ctx, promise: true, error: true }, e);
                }
                return;
            }

            // GENERATOR

            listen(
                worker,
                ctx,
                (data) => {
                    if (!data.ctx.abort) return;
                    subController.abort(data.ctx.abort);
                    console.log('RESPONDER GOT ABORT', data.ctx.abort, ctx);
                },
                subSignal,
            );

            try {
                let res: any;
                const iterator = responder(payload);
                do {
                    res = await rejectOnSignal(iterator.next(), subSignal);

                    send(worker, { ...ctx, done: res.done }, res.value);

                    await rejectOnSignal(
                        waitFor(worker, ctx, (data) => !!data.ctx.ack, subSignal),
                        subSignal,
                    );

                    console.log('RESPONDER ACK');
                } while (!res.done && !subSignal.aborted);
            } catch (e) {
                console.error('RESPONDER ERROR', e);
                if (!subSignal.aborted) send(worker, { ...ctx, error: true, done: true }, e);
            } finally {
                console.info('RESPONDER DONE');
            }
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

                if (payload) {
                    for (const [key, value] of Object.entries(payload)) {
                        if (value instanceof AbortSignal) {
                            ctx.signalName = key;
                            signal = value;
                            // console.log('CALLER FOUND SIGNAL', key);
                        }
                    }
                }

                const [mainController, mainSignal] = makeAbortController(signal);

                const cancel = (notify: boolean, reason: string = '') => {
                    if (mainController.signal.aborted) return;
                    console.log('CALLER CANCEL', reason, notify);
                    if (reason) mainController.abort(reason); // stop listening
                    if (notify) send(worker, { ...ctx, abort: reason }); // worker will break & acknowledge, but it's not important
                };

                // Generator

                const [promiseController, promiseSignal] = makeAbortController(mainSignal);

                const promise = waitFor(worker, ctx, (data) => !!data.ctx.promise, promiseSignal).then(
                    ({ ctx, payload }) => {
                        if (ctx.error) throw payload;
                        return payload;
                    },
                );

                async function* generator() {
                    try {
                        console.log('CALLER GENERATOR START');
                        promiseController.abort('GeneratorUsed');

                        do {
                            const data = await rejectOnSignal(waitFor(worker, ctx, undefined, mainSignal), mainSignal);

                            const { ctx: ctxIn, payload: payloadIn } = data;

                            console.log('CALLER EVENT', mainSignal.aborted, ctxIn, payloadIn);

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
                                return payloadIn;
                            } else {
                                yield payloadIn;
                                if (!mainSignal.aborted) send(worker, { ...ctx, ack: true });
                            }
                        } while (!mainSignal.aborted);
                    } finally {
                        // prevent further cycles in worker once main is closed/cancelled/aborted
                        console.log('CALLER DONE');
                        cancel(true, mainSignal.aborted ? mainSignal.reason : 'DoneOrBreak');
                    }
                }

                const iterator = generator();

                send(worker, ctx, payload);

                let started;

                // FIXME Nasty hack, return both iterator and promise
                //  Consuming code will get all, but IDE should show only proper type
                // return new Proxy(iterator, {
                //     get(target, prop, receiver) {
                //         if (prop === 'then' || prop === 'catch' || prop === 'finally') {
                //             console.log('PROMISE ACCESS');
                //             // kick off generator on first access
                //             // if (!started) started = iterator.next().then(({ value }) => value);
                //             // return started[prop].bind(started);
                //         }
                //         // return Reflect.get(target, prop, receiver);
                //         return target[prop].bind(target);
                //     },
                // });
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
