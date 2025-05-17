import { getTransferrable } from './workerUtils';

// Types

type WebWorker = Worker | (Window & typeof globalThis) | (WorkerGlobalScope & typeof globalThis);

type MethodReturn<R, M extends keyof R> = R[M] extends (...args: any[]) => any
    ? Partial<Awaited<ReturnType<R[M]>>>
    : never;

type MethodArg<R, M extends keyof R> = R[M] extends (arg: infer A, ...args: any[]) => any ? Partial<A> : never;

export type Ctx<R, K extends keyof R> = {
    id: string;
    parentId?: string;
    message: K;
    done: boolean;
};

type Data<R, M extends keyof R> = MethodReturn<R, M> | MethodArg<R, M> | Error;

type Event<R, M extends keyof R> = MessageEvent<{ data: Data<R, M>; ctx: Ctx<R, M> }>;

type Listener<R, M extends keyof R, D extends Data<R, M> = Data<R, M>, S extends Context<R, M> = Context<R, M>> = (
    data: D,
    self: S,
    event: Event<R, M>,
) => void | Promise<void>;

// Constants

const ALL = '*';

const RESPONDER = Symbol('responder');

function checkClosed(obj: any, label: string = 'external') {
    if (obj?.closed) throw new Error(`Context ${obj.id} is closed (${label})`, { cause: obj });
}

function checkMessage(obj: any, message: any) {
    if (!message) throw new Error('New context must have message', { cause: obj });
}

// Classes

export class WorkerDialog<R extends RespondersBase<any>> {
    readonly contexts: Set<Context<R, keyof R>> = new Set();
    protected closed = false;
    protected currentId = 0; // IDs are intentionally not global

    constructor(
        public worker: WebWorker,
        public responders: R,
        public name: string,
        public debug: number = 0, // 0 - none, 1 - general messages, 2 - sub/unsub, 3 - transport TODO Object?
    ) {
        if (!this.worker) return; // Next.js SSR

        for (const message in this.responders) {
            if (!this.responders?.[message]?.[RESPONDER]) continue;

            // root context with id=all
            const rootContext = new ResponseContext<R, typeof message>(this, message, ALL);

            //TODO: unsub(); ? Probably not needed, root must be always listening until closed by WorkerDialog
            rootContext.listen(async (data, context, event) => {
                // create sub context with ID
                const responseContext = context.withMessage(message, event.data.ctx.id);

                /* v8 ignore start */
                if (this.debug)
                    console.log('Root Listener', rootContext.info, {
                        rootContext: context,
                        data,
                        responseContext,
                        event,
                        responder: this.responders[message],
                    });
                /* v8 ignore stop */

                try {
                    responseContext.send(await (this.responders[message] as any)(data, responseContext), true);
                    responseContext.close('root.listener');
                } catch (e) {
                    /* v8 ignore next */
                    if (this.debug) console.error(`Error in responder ${responseContext.info}`, { e });
                    responseContext.send(e, true);
                }
            }, true);
        }
    }

    getID(): string {
        return (++this.currentId).toString();
    }

    close(): void {
        for (const context of this.contexts) context.close('root');
        this.contexts.clear();
    }

    withMessage<M extends keyof R>(message: M): RequestContext<R, M> {
        return new RequestContext<R, M>(this, message, this.getID()); // always new context
    }
}

export class RespondersBase<R> {
    create<M extends keyof R, F extends (input: any, context: ResponseContext<R, M>) => any>(
        message: M,
        responder: F,
    ): F {
        responder[RESPONDER] = true;
        return responder as any;
    }
}

// can only be used to create actual contexts, carries the context data
abstract class Context<R, M extends keyof R> {
    protected readonly unsub: Set<() => void> = new Set();
    protected closed = false;

    constructor(
        protected readonly dialog: WorkerDialog<any>,
        public message: M,
        public id: string | undefined,
        public parent: Context<R, keyof R> | undefined | null = null,
    ) {
        checkClosed(dialog, 'newContext');
        checkClosed(parent, 'newContext');
        checkMessage(this, message);
        this.id = id ?? parent?.id;
        if (!this.id) throw new Error('ID is required', { cause: this });
        this.dialog.contexts.add(this);
    }

    abstract withMessage<M2 extends keyof R>(message: M2, id?: string): Context<R, M2>;

    close(reason: string = 'external'): void {
        /* v8 ignore next */
        if (this.dialog.debug >= 2) console.log('Closing', this.info, reason, this);

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
        return `${this.dialog.name}:${this.parent?.id ?? ALL}/${this.id}:${this.message.toString()}[${this.closed ? 'closed' : 'open'},${this.type}]`;
    }

    get debugInfo(): {
        id?: string;
        parentId?: string;
        message: string | number | symbol;
        closed: boolean;
        type: string;
        listeners: number;
    } {
        return {
            id: this.id,
            parentId: this.parent?.id,
            message: this.message,
            closed: this.closed,
            type: this.type,
            listeners: this.unsub.size,
        };
    }

    abstract type: 'request' | 'response' | string;

    protected postMessage(data?: Data<R, M>, done = false): Data<R, M> | undefined {
        checkClosed(this, 'postMessage');

        const transfer = getTransferrable(data);

        const ctx = {
            done,
            id: this.id,
            parentId: this.parent?.id,
            message: this.message,
        };

        /* v8 ignore next */
        if (this.dialog.debug >= 3) console.log('postMessage', this.info, { ctx, data, transfer }, this);

        this.dialog.worker.postMessage({ data, ctx }, transfer);

        return data;
    }

    send(data?: Data<R, M>, done = false): Data<R, M> | undefined {
        return this.postMessage(data, done);
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
    listen(callback: Listener<R, M>, done = false): () => void {
        checkClosed(this, 'listen');

        const controller = new AbortController();

        this.dialog.worker.addEventListener(
            'message',
            async (event: Event<R, M>) => {
                try {
                    const {
                        data: { ctx, data },
                    } = event;

                    if (
                        !ctx ||
                        (this.id !== ALL && this.id !== ctx.id) ||
                        this.message !== ctx.message ||
                        (done && !ctx.done)
                    )
                        return; // unknown message from devtools etc., or different context

                    /* v8 ignore next */
                    if (this.dialog.debug) console.log('Listener event', this.info, event, this);

                    await callback(data, this, event); // Requests can come here, but they're typed in responders
                } catch (e) {
                    /* v8 ignore next */
                    if (this.dialog.debug) console.error(`Error in listener ${this.info}`, this, { event, e });
                    //TODO Respond with error?
                }
            },
            { signal: controller.signal },
        );

        const unsub = () => {
            /* v8 ignore next */
            if (this.dialog.debug >= 2) console.log('Stop listening', this.info, this);
            controller.abort();
            this.unsub.delete(unsub);
        };

        this.unsub.add(unsub);

        return unsub;
    }
}

class RequestContext<R, M extends keyof R> extends Context<R, M> {
    type = 'request';

    withMessage<M2 extends keyof R>(message: M2, id?: string): RequestContext<R, M2> {
        return new RequestContext<R, M2>(this.dialog, message, id, this);
    }

    send(data?: MethodArg<R, M>, done = false): MethodArg<R, M> {
        return super.send(data, done) as any;
    }

    listen(callback: Listener<R, M, MethodReturn<R, M>, RequestContext<R, M>>, done = false): () => void {
        return super.listen(callback, done);
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
        checkClosed(this, 'fetch');

        const res = await Promise.all([
            callback?.(this),
            this.expect(), // will be closed in expect -> listener -> unsub
            this.send(data, true),
        ]);

        /* v8 ignore next */
        if (this.dialog.debug >= 2) console.log('Fetch', this.info, this);

        this.close('fetch');

        return res[1];
    }

    protected async expect(): Promise<MethodReturn<R, M>> {
        checkClosed(this, 'expect');

        //FIXME Manual promise type
        return new Promise((resolve, reject) => {
            const responseListener = this.listen(async (data) => {
                try {
                    if ((data as any) instanceof Error) throw data;
                    responseListener();
                    /* v8 ignore next */
                    if (this.dialog.debug >= 3) console.log('Expect', this.info, data, this);
                    resolve(data as any);
                } catch (e) {
                    reject(e);
                }
            }, true);
        });
    }
}

class ResponseContext<R, M extends keyof R> extends Context<R, M> {
    type = 'response';

    withMessage<M2 extends keyof R>(message: M2, id?: string): ResponseContext<R, M2> {
        return new ResponseContext<R, M2>(this.dialog, message, id, this);
    }

    listen(callback: Listener<R, M, MethodArg<R, M>, ResponseContext<R, M>>, done = false): () => void {
        return super.listen(callback, done);
    }

    send(data?: MethodReturn<R, M>, done = false): MethodReturn<R, M> {
        return super.send(data, done) as any;
    }
}
