import { bold, magenta, cyan, yellow, red, green } from 'colors/safe';

export const colored = {
    important: bold,
    subject: magenta,
    arg: cyan,
    sup: yellow,
    err: red,
    ok: green,
};

const noColor = (str) => str;

export const uncolored = {
    important: noColor,
    subject: noColor,
    arg: noColor,
    sup: noColor,
    err: noColor,
    ok: noColor,
};

export function createMeasurer({ colors = true, prepend = 'LOG', padding = 10 }) {
    const { important, subject, arg, sup, ok, err } = colors ? colored : uncolored;

    function measure(what: string, step: string, supplemental: string = '', ...args) {
        const time = performance.now();

        const prefix = [
            prepend,
            important(subject(what.substring(0, padding).padStart(padding, ' '))),
            arg(step),
            sup(supplemental),
            ...args,
        ];

        const done = (result: string = ok('DONE'), ...args2) => {
            console.log(
                ...[
                    ...prefix,
                    important(result),
                    ...args2,
                    'in',
                    important((performance.now() - time).toFixed(0)),
                    'ms',
                ].filter(Boolean),
            );
            console.groupEnd();
        };

        const fail = (result: string = err('FAIL'), ...args2) => done(result, ...args2);

        const log = (...args2) => {
            console.log(...prefix, ...args2);
        };

        return { done, fail, log };
    }

    return { measure, important, subject, arg, sup, ok, err };
}
