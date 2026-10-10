import { describe, expect, test } from 'vitest';

import { PART_BYTES } from './auditParts';
import { modeFor, partition, renderScope } from './auditScope';

/** An evidence file of a capability, whole unless a slice number is given. */
const evidence = (capability: string, bytes: number, requirements = 1, slice?: number) => ({
    capability,
    file: `audit-parts/${capability}${slice ? `.${slice}` : ''}.md`,
    bytes,
    requirements,
    requirementIds: Array.from({ length: requirements }, (_, i) => `${capability}#requirement-${slice ?? 0}-${i}`),
});

/**
 * The partition is a function of the evidence files — tested here as such; what this corpus's parts are, is
 * repository state and belongs to the job that writes the file.
 */
describe('renderScope', () => {
    test('puts the verdict-like first line first and lists the parts with their files', () => {
        const md = renderScope(partition([evidence('apps/eve', 12 * 1024, 12)]));
        expect(md.split('\n')[0]).toBe('SCOPE all');
        expect(md).toContain('One part, 12 requirements (12 KB)');
    });
});

describe('partition', () => {
    test('keeps a scope one reader holds as a single part, heaviest first, and nothing in scope as none', () => {
        expect(partition([evidence('a', 20 * 1024, 20), evidence('b', 30 * 1024, 30)])).toEqual([
            {
                part: 1,
                capabilities: ['b', 'a'],
                files: ['audit-parts/b.md', 'audit-parts/a.md'],
                findings: ['audit-parts/findings/part-1-1.json'],
                requirementIds: [...evidence('b', 0, 30).requirementIds, ...evidence('a', 0, 20).requirementIds],
                bytes: 50 * 1024,
                requirements: 50,
            },
        ]);
        expect(partition(['a', 'b', 'c', 'd', 'e', 'f'].map((c) => evidence(c, PART_BYTES / 6)))).toHaveLength(1);
        expect(partition([])).toEqual([]);
    });

    test('cuts a large scope into parts no larger than one reader holds, losing nothing', () => {
        const files = Array.from({ length: 30 }, (_, i) => evidence(`cap-${i}`, (5 + i) * 1024, 5 + i));
        const parts = partition(files);
        expect(parts.length).toBeGreaterThan(1);
        expect(Math.max(...parts.map((p) => p.bytes))).toBeLessThanOrEqual(PART_BYTES);
        expect(parts.reduce((sum, p) => sum + p.bytes, 0)).toBe(files.reduce((a, f) => a + f.bytes, 0));
        expect(parts.flatMap((p) => p.requirementIds).sort()).toEqual(files.flatMap((f) => f.requirementIds).sort());
        expect(parts.flatMap((p) => p.files).sort()).toEqual(files.map((f) => f.file).sort());
        expect(parts.map((p) => p.part)).toEqual(parts.map((_, i) => i + 1));
    });

    test('places the slices of one capability like any other file, and a file over the cap alone', () => {
        const parts = partition([
            evidence('big', PART_BYTES - 1024, 10, 1),
            evidence('big', PART_BYTES - 1024, 10, 2),
            evidence('huge', PART_BYTES + 1024, 1),
            evidence('small', 1024, 1),
        ]);
        // Heaviest first by load — the slices, dense in requirements, before the larger single file.
        expect(parts.map((p) => p.files)).toEqual([
            ['audit-parts/big.1.md', 'audit-parts/small.md'],
            ['audit-parts/big.2.md'],
            ['audit-parts/huge.md'],
        ]);
        expect(parts[0]!.capabilities).toEqual(['big', 'small']);
    });

    test('cuts one round of parts for the reading slots, balanced, and a second only past the cap', () => {
        const files = Array.from({ length: 12 }, (_, i) => evidence(`cap-${i}`, (10 + i) * 1024, 10));
        const parts = partition(files, 'spec-verify', 4);
        expect(parts).toHaveLength(4);
        const bytes = parts.map((p) => p.bytes);
        expect(Math.max(...bytes) - Math.min(...bytes)).toBeLessThanOrEqual(21 * 1024);
        expect(parts.flatMap((p) => p.files).sort()).toEqual(files.map((f) => f.file).sort());
        expect(partition(files.slice(0, 2), 'spec-verify', 4)).toHaveLength(2);
        expect(
            partition(
                [1, 2, 3].map((i) => evidence(`big-${i}`, PART_BYTES - 1024)),
                'spec-verify',
                2,
            ),
        ).toHaveLength(3);
    });

    test('is the same partition whatever order the evidence files come in', () => {
        const files = Array.from({ length: 24 }, (_, i) => evidence(`cap-${i}`, ((i * 7) % 13) * 4 * 1024 + 1024, 3));
        const reversed = [...files].reverse();
        const shuffled = files.filter((_, i) => i % 2).concat(files.filter((_, i) => i % 2 === 0));
        expect(partition(reversed)).toEqual(partition(files));
        expect(partition(shuffled)).toEqual(partition(files));
    });
});

describe('modeFor', () => {
    test('is the corpus on the nightly and wherever there is no merge-request target, the affected set on a merge request', () => {
        expect(modeFor({ SPEC_AUDIT_NIGHTLY: 'true', CI_MERGE_REQUEST_TARGET_BRANCH_NAME: 'main' })).toBe('all');
        expect(modeFor({})).toBe('all');
        expect(modeFor({ CI_MERGE_REQUEST_TARGET_BRANCH_NAME: 'main' })).toBe('affected');
    });

    test('follows the tier script when it decided', () => {
        expect(modeFor({ AUDIT_SCOPE: 'corpus', CI_MERGE_REQUEST_TARGET_BRANCH_NAME: 'main' })).toBe('all');
        expect(modeFor({ AUDIT_SCOPE: 'affected' })).toBe('affected');
    });

    test('renders the affected scope with its detail, and an empty one as nothing to judge', () => {
        const md = renderScope([], 'affected', 'The set.');
        expect(md.split('\n')[0]).toBe('SCOPE affected');
        expect(md).toContain('The set.');
        expect(md).toContain('Nothing in scope');
    });
});
