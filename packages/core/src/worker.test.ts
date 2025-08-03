import { expect, describe, test, vi } from 'vitest';
import { RespondersBase, WorkerDialog } from './worker';
import EventEmitter from 'node:events';

// Prepare

//TODO @vitest/web-worker can ve used, coverage is collected, but this gives more direct access to worker internals
// class WorkerPeer extends EventEmitter implements WorkerLike {
class WorkerPeer extends EventEmitter {
    peer: WorkerPeer;

    setPeer(peer: WorkerPeer) {
        this.peer = peer;
    }

    postMessage(data: any) {
        this.peer?.emit('message', { data });
    }

    addEventListener(event: string, listener: (e: any) => void, options) {
        this[options['once'] ? 'once' : 'on'](event, listener);
        options?.signal?.addEventListener('abort', () => this.off(event, listener));
    }

    removeEventListener(event: string, listener: (e: any) => void) {
        this.off(event, listener);
    }
}

class Responders extends RespondersBase<Responders> {
    lastContext: any; // for testing purposes

    test = this.create(
        'test',
        async (
            { n, abort = false, buf }: { n: number; abort?: boolean; buf?: ArrayBuffer }, // should have all possible combinations for strong typing
            ctx,
        ) => {
            this.lastContext = ctx;

            const res: number[] = [];

            let aborted = false;
            let progress = 0;

            ctx.listen(({ abort }) => {
                if (abort) aborted = true;
            });

            for (const i of Array(n).keys()) {
                if (aborted) break;
                progress = (i + 1) / n;
                ctx.send({ progress });
                res.push(i);
            }

            return { res, progress, aborted };
        },
    );

    error = this.create(
        'error',
        async (
            _, // should have all possible combinations for strong typing
            ctx,
        ) => {
            this.lastContext = ctx;
            throw new Error('Test');
        },
    );
}

const createWorker = () => {
    const mainWorker = new WorkerPeer();
    const mainDialog = new WorkerDialog(
        mainWorker as never as Worker,
        {} as WorkerDialog<Responders>['responders'],
        'Main',
    );

    const worker = new WorkerPeer();
    const workerDialog = new WorkerDialog(worker as never as Worker, new Responders(), 'Worker');

    mainWorker.setPeer(worker);
    worker.setPeer(mainWorker);

    return { mainWorker, mainDialog, worker, workerDialog };
};

// Tests

describe('Worker', async () => {
    test('simple', async () => {
        const { mainDialog, workerDialog } = createWorker();

        const l = vi.fn();
        let mctx;

        const result = await mainDialog.withMessage('test').fetch({ n: 3, buf: new ArrayBuffer() }, (ctx) => {
            mctx = ctx;
            ctx.listen(l);
        });

        expect(l).toBeCalledTimes(4); // 3x progress, last
        expect(result).toStrictEqual({ res: [0, 1, 2], progress: 1, aborted: false });

        expect(mainDialog.contexts.size).toBe(0);
        expect(mctx.debugInfo.closed).toBe(true);

        expect(workerDialog.contexts.size).toBe(2);
        expect(workerDialog.contexts.values().next().value.debugInfo).toStrictEqual({
            id: '*',
            parentId: undefined,
            message: 'test',
            closed: false,
            type: 'response',
            listeners: 1,
        });
        expect(workerDialog.responders.lastContext.debugInfo).toStrictEqual({
            id: '1',
            parentId: '*',
            message: 'test',
            closed: true,
            type: 'response',
            listeners: 0,
        });
    });

    test('abort', async () => {
        const { mainDialog } = createWorker();

        const result = await mainDialog.withMessage('test').fetch({ n: 3 }, (ctx) => {
            ctx.listen(() => {
                ctx.send({ abort: true });
            });
        });

        expect(result).toStrictEqual({ res: [0], progress: 0.3333333333333333, aborted: true });
    });

    test('faulty listener', async () => {
        const { mainDialog } = createWorker();

        await mainDialog.withMessage('test').fetch({ n: 3 }, (ctx) => {
            ctx.listen(() => {
                throw new Error('Listener');
            });
        });

        expect.assertions(0); // nothing happened
    });

    test('error', async () => {
        const { mainDialog } = createWorker();
        await expect(async () => mainDialog.withMessage('error').fetch()).rejects.toThrowError('Test');
    });

    test('close', async () => {
        const { mainDialog, workerDialog } = createWorker();

        mainDialog.close();
        workerDialog.close();

        expect(mainDialog.contexts.size).toBe(0);
        expect(workerDialog.contexts.size).toBe(0);
    });

    test('empty message', async () => {
        expect(() => createWorker().mainDialog.withMessage(undefined as any)).toThrowError(
            'New context must have message',
        );
    });

    test('empty ID', async () => {
        const { mainDialog } = createWorker();
        const first = mainDialog.withMessage('test');
        expect(() => first.withMessage('error', '')).toThrowError('ID is required');
    });

    test('nesting', async () => {
        const { mainDialog } = createWorker();
        const first = mainDialog.withMessage('test');
        const second = first.withMessage('error', 'x');
        const third = second.withMessage('error');
        expect(mainDialog.contexts.size).toBe(3);
        expect(first.info).toBe('Main:*/1:test[open,request]');
        first.close();
        expect(mainDialog.contexts.size).toBe(0);
        expect(first.debugInfo.closed).toBe(true);
        expect(second.debugInfo.closed).toBe(true);
        expect(third.debugInfo.closed).toBe(true);
        expect(first.info).toBe('Main:*/1:test[closed,request]'); // id bumped from 0
        expect(second.info).toBe('Main:1/x:error[closed,request]'); // new id
        expect(third.info).toBe('Main:x/x:error[closed,request]'); // id kept
        await expect(() => first.fetch({ n: 1 })).rejects.toThrowError(/Context 1 is closed/);
    });
});
