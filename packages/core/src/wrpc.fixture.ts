import { wrpc } from './wrpc';

export const responder: {
    responders: {
        // note it's not async, and works properly
        // @ts-ignore
        test: ({ buf, signal }?: { signal?: AbortSignal; buf?: ArrayBuffer }) => Generator<
            {
                progress: number;
                aborted?: boolean;
            },
            string,
            unknown
        >;
        // note it's not async, and works properly
        returnYield: () => Generator<1 | 3 | 2, any, unknown>;
        bidirectional: (prefix?: any) => Generator<string, string, number>;

        error: () => AsyncGenerator<never, never, unknown>;
        promise: () => Promise<{
            test: string;
        }>;
        promiseError: () => Promise<never>;
        setTimeout: ({ timeout }?: { timeout?: number }) => Promise<unknown>;
        setInterval: ({ timeout }?: { timeout?: number }) => AsyncGenerator<any, never, unknown>;
    };
    stop: () => void;
} = wrpc().createResponder(self, {
    // note it's not async, and works properly
    test: function* ({ buf, signal }: { signal?: AbortSignal; buf?: ArrayBuffer } = {}): Generator<
        {
            progress: number;
            aborted?: boolean;
        },
        string,
        unknown
    > {
        yield { progress: 0 };
        yield { progress: 0.5 };
        yield { progress: 1, aborted: !!signal?.aborted };
        return 'foo';
    },
    // note it's not async, and works properly
    returnYield: function* (): Generator<1 | 3 | 2, any, unknown> {
        yield 1;
        yield 2;
        return yield 3;
    },
    bidirectional: function* (prefix = 1): Generator<string, string, number> {
        let i = 0;
        while (i < 3) {
            prefix = (yield prefix + '.' + i) || prefix;
            i++;
        }
        return 'done';
    },
    // eslint-disable-next-line require-yield
    error: async function* (): AsyncGenerator<never, never, unknown> {
        throw new Error('Test');
    },
    promise: async function (): Promise<{
        test: string;
    }> {
        return { test: 'test' };
    },
    promiseError: async function (): Promise<never> {
        throw new Error('Test');
    },
    setTimeout: async ({ timeout = 1000 }: { timeout?: number } = {}) =>
        new Promise((resolve) => setTimeout(resolve, timeout)),

    setInterval: async function* ({ timeout = 1000 }: { timeout?: number } = {}) {
        while (true) {
            yield await this.setTimeout(timeout);
        }
    },
});

// self.onmessage = (e) => {
//     console.log('MSG', e);
//     if (e.data.msg === 'info') {
//         self.postMessage({
//             responder: 'test', // responder.toString(),
//         });
//     }
// };

// self.onmessage = (e) => {
//     console.log('MSG', e);
//     self.postMessage(`${e.data} world`);
// };

self.addEventListener('message', (e) => {
    if (e.data.msg === 'info') {
        self.postMessage({
            msg: e.data.msg,
            responder: 'test', // responder.toString(),
        });
    }
    if (e.data.msg === 'stop') {
        responder.stop();
        self.postMessage({
            msg: e.data.msg,
        });
    }
});
