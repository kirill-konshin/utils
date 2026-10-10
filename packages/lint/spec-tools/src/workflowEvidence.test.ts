import { describe, expect, test } from 'vitest';

import { classify, workflowEvidence } from './workflowEvidence';

/** The decision alone — the filesystem reading around it is the gate's business, not the test's. */
describe('workflowEvidence', () => {
    const clean = { openDeltas: [], syncedUnarchived: [] };

    test('passes when no open change carries deltas and none is synced', () => {
        expect(workflowEvidence(clean)).toBeNull();
    });

    test('refuses an open change still carrying delta files, naming it', () => {
        const open = ['my-change — carries 1 delta file(s): specs/billing/refunds/spec.md'];
        const verdict = workflowEvidence({ ...clean, openDeltas: open });
        expect(verdict).toMatch(/still carries delta files/);
        expect(verdict).toContain(open[0]);
        expect(verdict).toMatch(/archive it/);
        expect(verdict).not.toMatch(/synced but not archived/);
    });

    test('refuses an open change whose deltas are already live, naming it', () => {
        const synced = ['my-change — ADDED "New rule" is already in constitution'];
        const verdict = workflowEvidence({ ...clean, syncedUnarchived: synced });
        expect(verdict).toMatch(/synced but not archived/);
        expect(verdict).toContain(synced[0]);
        expect(verdict).not.toMatch(/still carries delta files/);
    });

    test('reports both halves when both hold', () => {
        const verdict = workflowEvidence({
            openDeltas: ['x — carries 2 delta file(s): specs/a/spec.md, specs/b/spec.md'],
            syncedUnarchived: ['x — ADDED "y" is already in z'],
        });
        expect(verdict).toMatch(/still carries delta files/);
        expect(verdict).toMatch(/synced but not archived/);
    });
});

/** The answer `spec-tools tier` reads its run class from — which kind of open change a branch touches. */
describe('classify', () => {
    const evidence = {
        openDeltas: ['delta-flow — carries 1 delta file(s): specs/a/spec.md'],
        syncedUnarchived: ['synced — ADDED "y" is already in z'],
    };

    test('is deltas for an open change carrying deltas or synced but not archived, skip-specs for one carrying none, none otherwise', () => {
        expect(classify(['parked', 'delta-flow'], evidence)).toBe('deltas');
        expect(classify(['synced'], evidence)).toBe('deltas');
        expect(classify(['parked'], evidence)).toBe('skip-specs');
        expect(classify([], evidence)).toBe('none');
    });
});
