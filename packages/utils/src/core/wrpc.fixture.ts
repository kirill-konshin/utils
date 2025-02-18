import { createResponder } from './wrpc';

export const responder = createResponder(self, {
    // note it's not async, and works properly
    test: function* ({ n, buf, signal }: { n: number; signal?: AbortSignal; buf?: ArrayBuffer }) {
        const res: number[] = [];

        let progress = 0;

        for (const i of Array(n).keys()) {
            console.log('Iteration', i, signal?.aborted);
            // await Promise.resolve();
            if (signal?.aborted) break; //FIXME Still can move forward as events may lag
            progress = (i + 1) / n;
            yield { progress };
            res.push(i);
        }

        //FIXME ADD TO README https://stackoverflow.com/questions/77727664/how-to-get-returned-value-from-async-generator-when-using-for-await
        yield { res, progress, aborted: !!signal?.aborted };

        return 'foo';
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
