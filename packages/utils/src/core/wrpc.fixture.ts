import { wrpc } from './wrpc';

export const responder = wrpc().createResponder(self, {
    // note it's not async, and works properly
    test: function* ({ buf, signal }: { signal?: AbortSignal; buf?: ArrayBuffer } = {}) {
        yield { progress: 0 };
        yield { progress: 0.5 };
        yield { progress: 1, aborted: !!signal?.aborted };
        return 'foo';
    },
    // note it's not async, and works properly
    returnYield: function* () {
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
    error: async function* () {
        throw new Error('Test');
    },
    promise: async function () {
        return { test: 'test' };
    },
    promiseError: async function () {
        throw new Error('Test');
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
