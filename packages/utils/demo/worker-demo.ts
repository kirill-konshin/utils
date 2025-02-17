import { RespondersBase, WorkerDialog } from '../src/core';

class Responders extends RespondersBase<Responders> {
    encode = this.create(
        'encode',
        async (
            { file, abort = false }: { file: File; abort: boolean }, // should have all possible combinations for strong typing
            encodeContext,
        ) => {
            // send within same message
            encodeContext.send({ progress: 0 }); // ✅ Valid
            encodeContext.send({ junk: 'xxx' }); // ❌ Bad & should be red

            // listen same message
            encodeContext.listen(({ abort }) => {
                if (abort) alert('Aborted'); // ✅ Valid
            });

            // send same message as received
            encodeContext.send({ junk: 'xxx' }); // ❌ Bad & should be red
            encodeContext.send({ progress: 0.5 }); //  ✅ Valid

            // send or listen different message
            encodeContext.withMessage('decode').listen(() => {}); // ✅ Valid
            encodeContext.withMessage('decode').send({ file: null }); // ✅ Valid
            encodeContext.withMessage('decode').send({ junk: 'xxx' }); // ❌ Bad & should be red
            encodeContext.withMessage('junk'); // ❌ Bad & should be red

            return { bitmap: await createImageBitmap(file), progress: 1.0 }; // should have all possible combinations for strong typing
        },
    );

    // another responder for demo purposes
    decode = this.create('decode', async ({ bitmap }) => {
        return { file: new File([], 'test') };
    });
}

export const workerDialog = new WorkerDialog(self, new Responders(), 'Worker');

/////

// import type { workerDialog } from './worker';

const mainDialog = new WorkerDialog(self, {} as typeof workerDialog.responders, 'Main');

mainDialog
    .withMessage('encode')
    .fetch(
        {
            file: new File([], 'test'), // ✅ Valid
            junk: 'xxx', // ❌ Bad & should be red
        },
        (encodeContext) => {
            // Listen same message, partial data update
            encodeContext.listen((data) => {
                console.log(data.progress); // ✅ Valid
                console.log(data.junk); // ❌ Bad & should be red
            });

            // Listen or send other message
            encodeContext.withMessage('decode').listen((data, decodeContext) => {});
            encodeContext.withMessage('decode').send({ bitmap: null }); // ✅ Valid
            encodeContext.withMessage('decode').send({ junk: 'xxx' }); // ❌❌❌ Bad & should be red, broken

            // Send abort
            encodeContext.send({ abort: true }); // ✅ Valid
        },
    )
    .then((result) => {
        console.log(result.bitmap); // ✅ Valid
        console.log(result.junk); // ❌ Bad & should be red
    });
