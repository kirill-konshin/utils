import { createMeasurer } from '@kirill.konshin/core';
import { PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from 'next/constants';

export const isProd: boolean =
    process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD || process.env.NEXT_PHASE === PHASE_PRODUCTION_SERVER;

export const measurer: {
    measure: (
        what: string,
        step: string,
        supplemental?: string,
        ...args: any[]
    ) => {
        done: (result?: string, ...args2: any[]) => void;
        fail: (result?: string, ...args2: any[]) => void;
        log: (...args2: any[]) => void;
    };
    important: (str: any) => any;
    subject: (str: any) => any;
    arg: (str: any) => any;
    sup: (str: any) => any;
    ok: (str: any) => any;
    err: (str: any) => any;
} = createMeasurer({ colors: isProd });
