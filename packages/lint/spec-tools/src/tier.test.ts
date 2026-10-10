import { describe, expect, test } from 'vitest';

import { dotenv, memoryOf, tier, workersFor } from './tier';
import type { OpenChangeClass } from './workflowEvidence';

/**
 * The run's class is a function of the pipeline's variables — tested here over each row of the table. A merge
 * request's open changes are a stand-in answer, so no case reads a tree.
 */
const answer = (open: OpenChangeClass) => () => open;
const unreachable = (): OpenChangeClass => {
    throw new Error('the open changes are asked only for a non-draft merge request');
};

const haiku = { model: 'claude-haiku-5-5', effort: 'high' };
const sonnet = { model: 'claude-sonnet-5-5', effort: 'medium' };
/** Every run reads on the cheap model; `judge` is the verifier's. Two workers at a time unless raised. */
const models = (judge: typeof haiku) => ({
    AUDIT_MODEL: haiku.model,
    AUDIT_EFFORT: haiku.effort,
    AUDIT_MODEL_VERIFY: judge.model,
    AUDIT_EFFORT_VERIFY: judge.effort,
    AUDIT_SLOTS: 2,
});
const affected = { AUDIT_SCOPE: 'affected', AUDIT_GATING: 'advisory', ...models(haiku) };

describe('tier', () => {
    test('the nightly reads the corpus on the cheap model, advises, and is judged on the expensive one', () => {
        expect(tier({ SPEC_AUDIT_NIGHTLY: 'true', CI_MERGE_REQUEST_IID: '7' }, unreachable)).toEqual({
            AUDIT_RUN: 'nightly',
            AUDIT_SCOPE: 'corpus',
            AUDIT_GATING: 'advisory',
            ...models(sonnet),
        });
    });

    test('a non-draft merge request touching no open change is gated over its affected set, read and judged cheap', () => {
        expect(tier({ CI_MERGE_REQUEST_IID: '7' }, answer('none'))).toEqual({
            AUDIT_RUN: 'merge-request',
            ...affected,
            AUDIT_GATING: 'gating',
        });
    });

    test('a draft is advised over its affected set, read and judged cheap, whatever it touches', () => {
        expect(tier({ CI_MERGE_REQUEST_IID: '7', CI_MERGE_REQUEST_DRAFT: 'true' }, unreachable)).toEqual({
            AUDIT_RUN: 'draft',
            ...affected,
        });
    });

    test.each(['deltas', 'skip-specs'] as const)(
        'a merge request touching an open change (%s) is advised over its affected set',
        (open) => {
            expect(tier({ CI_MERGE_REQUEST_IID: '7' }, answer(open))).toEqual({
                AUDIT_RUN: 'open-change',
                ...affected,
            });
        },
    );

    test('a merge request that cannot be classified fails instead of reading as one that touches nothing', () => {
        const broken = (): OpenChangeClass => {
            throw new Error('no base');
        };
        expect(() => tier({ CI_MERGE_REQUEST_IID: '7' }, broken)).toThrow('no base');
    });

    test('a default-branch push is gated over its affected set, read cheap and judged on the expensive model', () => {
        expect(tier({}, unreachable)).toEqual({
            AUDIT_RUN: 'default-branch',
            AUDIT_SCOPE: 'affected',
            AUDIT_GATING: 'gating',
            ...models(sonnet),
        });
    });

    test('the pipeline variables override both models', () => {
        const env = {
            SPEC_AUDIT_NIGHTLY: 'true',
            AUDIT_MODEL_CHEAP: 'm1',
            AUDIT_EFFORT_CHEAP: 'low',
            AUDIT_MODEL_EXPENSIVE: 'm2',
            AUDIT_EFFORT_EXPENSIVE: 'xhigh',
        };
        expect(tier(env, unreachable)).toMatchObject({
            AUDIT_MODEL: 'm1',
            AUDIT_EFFORT: 'low',
            AUDIT_MODEL_VERIFY: 'm2',
            AUDIT_EFFORT_VERIFY: 'xhigh',
        });
    });

    test('sizes the audit job by its memory, capped by AUDIT_WORKERS, two workers unless raised', () => {
        expect(tier({ AUDIT_JOB_MEMORY: '4Gi', AUDIT_WORKERS: '16' }, unreachable).AUDIT_SLOTS).toBe(13);
        expect(tier({ AUDIT_JOB_MEMORY: '4Gi' }, unreachable).AUDIT_SLOTS).toBe(2);
        expect(workersFor({ AUDIT_WORKERS: '8' }, memoryOf('1536Mi'))).toBe(5);
        expect(workersFor({ AUDIT_WORKERS: '8' }, memoryOf('256M'))).toBe(1);
        expect(memoryOf('2G')).toBe(memoryOf('2Gi'));
        expect(() => memoryOf('lots')).toThrow('bad memory size');
    });

    test('prints the decision as dotenv lines', () => {
        expect(dotenv(tier({}, unreachable)).split('\n')[0]).toBe('AUDIT_RUN=default-branch');
    });
});
