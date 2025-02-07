export function isTransferable(obj: any): boolean {
    return transferrable.some((t) => obj instanceof t) ? obj : null;
}

function getTransferrable(data: any = {}): Transferable[] {
    if (!data) return [];
    return Object.values<any>(data)
        .reduce((r, v) => {
            return Array.isArray(v) ? [...r, ...v.map(isTransferable)] : [...r, isTransferable(v)];
        }, [])
        .filter(Boolean);
}

// @see https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects
const transferrable =
    typeof window !== 'undefined'
        ? [
              ArrayBuffer,
              MessagePort,
              ReadableStream,
              WritableStream,
              TransformStream,
              // WebTransportReceiveStream, // ReferenceError: WebTransportReceiveStream is not defined
              // WebTransportSendStream, // ReferenceError: WebTransportReceiveStream is not defined
              // AudioData, // TS2304: Cannot find name AudioData
              ImageBitmap,
              VideoFrame,
              OffscreenCanvas,
              RTCDataChannel,
              MediaSourceHandle,
              // MIDIAccess, // ReferenceError: MIDIAccess is not defined
          ].filter(Boolean)
        : [];

type WebWorker = Worker | (Window & typeof globalThis) | (WorkerGlobalScope & typeof globalThis);

type MethodReturn<R, M extends keyof R> = R[M] extends (...args: any[]) => any
    ? Partial<Awaited<ReturnType<R[M]>>>
    : never;

type MethodArg<R, M extends keyof R> = R[M] extends (arg: infer A, ...args: any[]) => any ? Partial<A> : never;

export type Ctx<R, K extends keyof R> = {
    id: string;
    parentId?: string;
    message: K;
};

type Data<R, M extends keyof R> = MethodReturn<R, M> | MethodArg<R, M> | Error;

type Event<R, M extends keyof R> = MessageEvent<{ data: Data<R, M>; ctx: Ctx<R, M> }>;

type Listener<R, M extends keyof R, D extends Data<R, M> = Data<R, M>, S extends Context<R, M> = Context<R, M>> = (
    data: D,
    self: S,
    event: Event<R, M>,
) => void | Promise<void>;

const ALL = '*';

let id = 0;

function getID() {
    return (++id).toString();
}

function checkClosed(obj: any, label: string = 'external') {
    if (obj?.closed) throw new Error(`Context is closed ${this.info} (${label})`, { cause: obj });
}

function checkMessage(obj: any, message: any) {
    if (!message) throw new Error('New context must have message', { cause: obj });
}

export class WorkerDialog<R extends RespondersBase<any>> {
    readonly contexts = new Set<Context<R, keyof R>>();
    protected closed = false;

    constructor(
        public worker: WebWorker,
        public responders: R,
        public name: string,
    ) {
        if (!this.worker) return; // Next.js SSR

        for (const message in this.responders) {
            if (['constructor', 'create'].includes(message)) continue;

            // root context with id=all
            const rootContext = new ResponseContext<R, typeof message>(this, message, ALL);

            //TODO: unsub(); ? Probably not needed, root must be always listening until closed by WorkerDialog
            rootContext.listen(async (data, context, event) => {
                // create sub context with ID
                const responseContext = context.withMessage(message, event.data.ctx.id);

                console.log('Root Listener', rootContext.info, {
                    rootContext: context,
                    data,
                    responseContext,
                    event,
                    responder: this.responders[message],
                });

                try {
                    responseContext.send(await (this.responders[message] as any)(data, responseContext));
                    responseContext.close('root.listener');
                } catch (e) {
                    console.error(`Error in responder ${responseContext.info}`, { e });
                    responseContext.send(e);
                }
            });
        }
    }

    close() {
        for (const context of this.contexts) context.close('root');
        this.contexts.clear();
        this.worker.onmessage = null;
    }

    withMessage<M extends keyof R>(message: M) {
        return new RequestContext<R, M>(this, message, getID());
    }
}

export class RespondersBase<R> {
    create<M extends keyof R, F extends (input: any, context: ResponseContext<R, M>) => any>(
        message: M,
        responder: F,
    ): F {
        return responder as any;
    }
}

// can only be used to create actual contexts, carries the context data
abstract class Context<R, M extends keyof R> {
    protected readonly unsub = new Set<() => void>();
    protected closed = false;

    constructor(
        protected readonly dialog: WorkerDialog<any>,
        public message: M,
        public id: string | undefined,
        public parent: Context<R, keyof R> | undefined | null = null,
    ) {
        checkClosed(this.dialog, 'newContext');
        checkClosed(this.parent, 'newContext');
        checkMessage(this, message);
        this.id = parent?.id === ALL ? getID() : id ? id : this.parent?.id;
        if (!this.id) throw new Error('ID is required', { cause: this });
    }

    abstract withMessage<M2 extends keyof R>(message: M2, id?: string): Context<R, M2>;

    close(reason: string = 'external') {
        // console.log('Closing', this.id, reason, this);

        this.dialog.contexts.delete(this);

        // Unsubscribe from all listeners
        for (const unsub of this.unsub) unsub();
        this.unsub.clear();

        // Remove all child contexts
        this.dialog.contexts.forEach((context) => {
            if (context.parent?.id === this.id) context.close('parent');
        });

        this.closed = true;
    }

    get info() {
        return this.dialog.name + '.' + this.parent?.id + '.' + this.id + '.' + this.message.toString();
    }

    protected postMessage(data?: Data<R, M>) {
        checkClosed(this, 'postMessage');

        const transfer = getTransferrable(data);

        // console.log('postMessage', this.id, this, { mergedCtx, data, transfer });

        this.dialog.worker.postMessage(
            {
                data,
                ctx: {
                    id: this.id,
                    parentId: this.parent?.id,
                    message: this.message,
                },
            },
            transfer,
        );

        return data;
    }

    send(data?: Data<R, M>) {
        return this.postMessage(data);
    }

    /**
     * Does not automatically close, assumes consumer will close
     *
     * ```ts
     * dialog.request('x').fetch((c) => {
     *   c.response('x').listen(() => { ... }); // listens to "x", will be closed by upper level fetch
     *   c.request('x').fetcH(y, (c) => { ... }); // closes
     * }) // closes
     *
     * const un = dialog.context('x').listen((e) => { ... }); // listens to 'x'
     * un(); // closes
     *
     * const un = dialog.context('x').listen((e) => { ... }); // listens to 'x'
     * un(); // closes
     * ```
     */
    listen(callback: Listener<R, M>): () => void {
        checkClosed(this, 'listen');

        let workerListener: any;

        this.dialog.worker.addEventListener(
            'message',
            (workerListener = async (event: Event<R, M>) => {
                try {
                    const {
                        data: { ctx, data },
                    } = event;

                    if (!ctx || (this.id !== ALL && this.id !== ctx.id) || this.message !== ctx.message) return; // unknown message from devtools etc., or different context

                    console.log('Shared listener event', this.info, this, event);

                    await callback(data, this, event); // Requests can come here, but they're typed in responders
                } catch (e) {
                    console.error(`Error in listener ${this.info}`, this, { event, e });
                }
            }),
        );

        const unsub = () => {
            // console.log('Stop listening', this.id, this);
            this.dialog.worker.removeEventListener('message', workerListener);
            this.unsub.delete(unsub);
        };

        this.unsub.add(unsub);

        return unsub;
    }
}

class RequestContext<R, M extends keyof R> extends Context<R, M> {
    withMessage<M2 extends keyof R>(message: M2, id?: string): RequestContext<R, M2> {
        return new RequestContext<R, M2>(this.dialog, message, id, this);
    }

    send(data?: MethodArg<R, M>): MethodArg<R, M> {
        return super.send(data) as any;
    }

    listen(callback: Listener<R, M, MethodReturn<R, M>, RequestContext<R, M>>): () => void {
        return super.listen(callback);
    }

    /**
     * Returns response
     * If you need to work with ctx, use callback
     * Closed automatically on response
     *
     * dialog.fetch('x', (c) => {
     *   c.listen(() => { ... }); // will be closed by upper level fetch
     *   c.fetcH(y, (c) => { ... }); // closes c
     *   c.context().fetcH(y, (c) => { ... }); // closes sub, not closes c, will be closed by upper level fetch
     * })
     */
    async fetch(
        data?: MethodArg<R, M>,
        callback?: (context: RequestContext<R, M>) => void,
    ): Promise<MethodReturn<R, M>> {
        const res = await Promise.all([
            callback?.(this),
            this.expect(), // will be closed in expect -> listener -> unsub
            this.send(data),
        ]);

        // console.log('Fetch', this.id, this.contexts, this.ownContexts);

        this.close('fetch');

        return res[1];
    }

    protected async expect() {
        checkClosed(this, 'expect');

        //FIXME Manual promise type
        return new Promise<MethodReturn<R, M>>((resolve, reject) => {
            const responseListener = this.listen(async (data) => {
                try {
                    if ((data as any) instanceof Error) throw data;
                    responseListener();
                    // console.log('Expect', this.id, this, eventData);
                    resolve(data as any);
                } catch (e) {
                    reject(e);
                }
            });
        });
    }
}

class ResponseContext<R, M extends keyof R> extends Context<R, M> {
    withMessage<M2 extends keyof R>(message: M2, id?: string): ResponseContext<R, M2> {
        return new ResponseContext<R, M2>(this.dialog, message, id, this);
    }

    listen(callback: Listener<R, M, MethodArg<R, M>, ResponseContext<R, M>>): () => void {
        return super.listen(callback);
    }

    send(data?: MethodReturn<R, M>): MethodReturn<R, M> {
        return super.send(data) as any;
    }
}
