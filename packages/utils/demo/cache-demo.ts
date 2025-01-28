/* eslint-disable */

import { z, ZodType } from 'zod';

export type EventType = 'request' | 'response';

type MethodReturn<R, M extends keyof R> = R[M] extends (...args: any[]) => any ? Awaited<ReturnType<R[M]>> : never;

type MethodArg<R, M extends keyof R> = R[M] extends (context: any, input: infer I) => any ? I : never;

type Data<R, M extends keyof R, T extends EventType> = T extends 'response' ? MethodReturn<R, M> : MethodArg<R, M>;

// can only be used to create actual contexts, carries the context data
class ContextSeed<R, M extends keyof R, T extends EventType> {
    constructor(
        public responders: R,
        public message: M,
        public type: T,
        public id: string,
    ) {}

    req<M extends keyof R>(message: M) {
        return new RequestContext<R, M>(this.responders, message, 'request', this.id);
    }

    res<M extends keyof R>(message: M) {
        return new ResponseContext<R, M>(this.responders, message, 'response', this.id);
    }
}

// base class with basic non-direction specific methods
class Context<R, M extends keyof R, T extends EventType> extends ContextSeed<R, M, T> {
    send(data: Data<R, M, T>): this {
        return this;
    }

    listen(
        callback: (
            data: Data<R, M, T>,
            self: this,
            event: MessageEvent<{ data: Data<R, M, T>; context: Pick<typeof this, 'message' | 'type' | 'id'> }>,
        ) => void,
    ): () => void {
        return () => {};
    }
}

class ResponseContext<R, M extends keyof R> extends Context<R, M, 'response'> {
    send(data: MethodReturn<R, M>): this {
        return this;
    }
}

class RequestContext<R, M extends keyof R> extends Context<R, M, 'request'> {
    send(data: MethodArg<R, M>): this {
        return this;
    }

    fetch(data: MethodArg<R, M>, callback?: (context: RequestContext<R, M>) => void): Promise<MethodReturn<R, M>> {
        return Promise.resolve(null as any);
    }
}

class Dialog<R> {
    constructor(public responders: R) {}

    req<M extends keyof R>(message: M) {
        return new RequestContext<R, M>(this.responders, message, 'request', crypto.randomUUID());
    }

    res<M extends keyof R>(message: M) {
        return new ResponseContext<R, M>(this.responders, message, 'response', crypto.randomUUID());
    }
}

////////////////////////////////////////////////////////////////////////////////

// Worker

class RespondersBase<R> {
    create<
        M extends keyof R,
        S extends ZodType<any, any, any>,
        F extends (context: Context<R, M, 'response'>, input: z.infer<S>) => any,
    >(
        message: M, // <--- this is needed just to tell TS what message this is
        schema: S,
        responder: F,
    ): F {
        return ((context, input) => {
            schema.parse(input);
            return responder(context, input);
        }) as any;
    }
}

/**
 * Works perfectly
 */
class Responders extends RespondersBase<Responders> {
    encode = this.create(
        'encode',
        z.object({
            file: z.instanceof(File),
        }),
        async (context, { file }) => {
            // send extra data within same message
            context.listen((data, ctx) => {
                data.file;
            });

            // send extra data within same message
            context.send({ bitmap: await createImageBitmap(new File([], 'test')) }); // ✅ Valid
            context.send({ junk: 'xxx' }); // ❌ Bad & should be red

            // send data within different message
            context.res('progress').send({ progress: 0 }); // ✅ Valid
            context.res('progress').send({ junk: 'xxx' }); // ❌ Bad & should be red

            // request data
            context.req('progress').send({ total: 0 }); // ✅ Valid
            context.req('progress').send({ junk: 'xxx' }); // ❌ Bad & should be red

            // bad names
            context.req('junk'); // ❌ Bad & should be red
            context.res('junk'); // ❌ Bad & should be red

            return { bitmap: await createImageBitmap(file) };
        },
    );

    progress = this.create(
        'progress',
        z.object({
            total: z.number(),
        }),
        (context, { total }: { total: number }) => {
            return { progress: total / 2 };
        },
    );
}

// Main

// import type { Responders } from './worker';

const dialog = new Dialog({} as Responders);

dialog.res('progress').send({ progress: 0 }); // ✅ Valid

dialog
    .req('encode')
    .fetch({ file: new File([], 'test') }, (context) => {
        context.res('progress').listen((data, ctx) => {
            // get periodical updates while operation is running
            console.log(data.progress); // ✅ Valid
            console.log(data.junk); // ❌ Bad & should be red

            // could be an abort message
            ctx.res('progress').send({ progress: 0 }); // ✅ Valid
            ctx.req('progress').send({ total: 0 }); // ✅ Valid
            ctx.req('progress').send({ junk: 'xxx' }); // ❌ Bad & should be red
        });
    })
    .then((res) => {
        console.log(res.bitmap);
    });

dialog.req('junk'); // ❌ Bad & should be red

dialog.req('encode').fetch({ junk: new File([], 'test') }); // ❌ Bad & should be red

////////////////////////////////////////////////////////////////////////////////

type ResSchema = Record<string, [ZodType, ZodType]>;
type ResSchemaFinal<S extends ResSchema> = { [K in keyof S]: [K, S[K][0], S[K][1]] };

const createSchema = <S extends ResSchema>(s: S): ResSchemaFinal<S> => {
    return null as any;
};

/**
 * CREATE function and object
 *
 * Validation works, but navigation does not, plus it's not valid code to use responders2 before creation
 */
function create<
    S extends ResSchemaFinal<ResSchema>,
    M extends keyof S,
    F extends (key: S[M][0], input: S[M][1]) => S[M][2],
>(schema: S, message: M, responder: F): F { // context: Context<S, M, 'response'>
    return responder as any;
}

const schema = createSchema({
    encode: [
        z.object({
            file: z.instanceof(File),
        }),
        z.object({
            bitmap: z.instanceof(ImageBitmap),
        }),
    ],
    preview: [
        z.object({
            total: z.number(),
        }),
        z.object({
            progress: z.number(),
        }),
    ],
});

const responders2 = {
    encode: create(schema, 'encode', async (context, { file }: { file: File }) => {
        // send extra data within same message
        context.listen((data, ctx) => {
            data.file;
            data.bitmap;
        });

        // send extra data within same message
        context.send({ bitmap: await createImageBitmap(new File([], 'test')) }); // ✅ Valid
        context.send({ junk: 'xxx' }); // ❌ Bad & should be red

        // send data within different message
        context.res('progress').send({ progress: 0 }); // ✅ Valid
        context.res('progress').send({ junk: 'xxx' }); // ❌ Bad & should be red

        // request data
        context.req('progress').send({ total: 0 }); // ✅ Valid
        context.req('progress').send({ junk: 'xxx' }); // ❌ Bad & should be red

        // bad names
        context.req('junk'); // ❌ Bad & should be red
        context.res('junk'); // ❌ Bad & should be red

        return { bitmap: await createImageBitmap(file) };
    }),
    progress: create(schema, 'progress', (context, { total }) => {
        return { progress: total / 2 };
    }),
};

////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////

type RespondersType<R extends Record<string, (...args: any[]) => any>> = {
    [K in keyof R]: (context: Context<R, K, 'response'>, input: Parameters<R[K]>[0]) => ReturnType<R[K]>;
};

/**
 * TYPE DEF and object
 * Works fine but navigation points to type and not the function
 */
const responders: RespondersType<{
    encode: (input: { file: File }) => Promise<{ bitmap: ImageBitmap }>;
    progress: (input: { total: number }) => { progress: number };
}> = {
    async encode(context, { file }) {
        // send extra data within same message
        context.listen((data, ctx) => {
            data.file;
            data.bitmap;
        });

        // send extra data within same message
        context.send({ bitmap: await createImageBitmap(new File([], 'test')) }); // ✅ Valid
        context.send({ junk: 'xxx' }); // ❌ Bad & should be red

        // send data within different message
        context.res('progress').send({ progress: 0 }); // ✅ Valid
        context.res('progress').send({ junk: 'xxx' }); // ❌ Bad & should be red

        // request data
        context.req('progress').send({ total: 0 }); // ✅ Valid
        context.req('progress').send({ junk: 'xxx' }); // ❌ Bad & should be red

        // bad names
        context.req('junk'); // ❌ Bad & should be red
        context.res('junk'); // ❌ Bad & should be red

        return { bitmap: await createImageBitmap(file) };
    },

    progress(context, { total }) {
        return { progress: total / 2 };
    },
};

////////////////////////////////////////////////////////////////////////////////

export type RespondersMap<R extends Record<string, (...args: any[]) => any>> = {
    [K in keyof R]: (key: K, input: Parameters<R[K]>[1]) => Awaited<ReturnType<R[K]>>;
};

/**
 * Broken completely
 */
const createObject = <R extends Record<string, (...args: any[]) => any>>(
    creator: (
        create: <K extends keyof R>(key: K, responder: (context: Context<R, K, any>, input: any) => any) => R[K],
    ) => R,
): {
    [K in keyof R]: (key: K, input: Parameters<R[K]>[1]) => Awaited<ReturnType<R[K]>>;
} => {
    const obj = {} as any;

    const create = (key: any, fn: any) => {
        obj[key] = function (key, input) {
            return fn.call(this, key, input);
        };
    };

    creator(create as any);

    return obj;
};

const obj = createObject((create) => {
    return {
        encode: create('encode', (c, file: File) => {
            c.res('progress').send({ progress: 0 });
            return { bitmap: createImageBitmap(file) };
        }),
        progress: create('progress', (c, total: number) => {
            return { progress: total / 2 };
        }),
    };
});

// Usage example
obj.encode('xxxx', new File([], 'test')).then((result) => {
    console.log(result.bitmap); // ImageBitmap
    console.log(result.bitmapxxx); // ImageBitmap
});

obj.progress('xxxx', 'xxx').then((result) => {
    console.log(result.progress); // 50
    console.log(result.progressxxx); // 50
});
