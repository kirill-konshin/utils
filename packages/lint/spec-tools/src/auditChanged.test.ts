import { describe, expect, test } from 'vite-plus/test';

import {
    AFFECTED_DEFAULTS,
    affectedOptions,
    deltaBlocks,
    deltaRequirements,
    grow,
    type Hunk,
    hunksOf,
    reachedBy,
    requirementsTouched,
    touches,
} from './auditChanged';
import type { Requirement, Term } from './auditParts';

/**
 * The focused check is a function of the diff and the evidence model — tested here as such.
 */
const requirement = (capability: string, slug: string, line: number, endLine: number): Requirement => ({
    capability,
    file: `openspec/specs/${capability}/spec.md`,
    name: slug,
    slug,
    line,
    endLine,
    block: '',
    statement: '',
    scenarioSlugs: [],
    advisory: false,
    gaps: [],
    bindings: [],
    pointers: [],
    terms: [],
    related: [],
});
const terms = (...names: string[]): Term[] => names.map((term) => ({ term, hits: [] }));

const diff = [
    'diff --git a/openspec/specs/<a>/spec.md b/openspec/specs/<a>/spec.md',
    '--- a/openspec/specs/<a>/spec.md',
    '+++ b/openspec/specs/<a>/spec.md',
    '@@ -12 +12 @@',
    '+changed sentence',
    '@@ -40,2 +40,3 @@',
    '+one',
    '+two',
    '+three',
    '@@ -60,1 +60,0 @@',
    '-gone',
    'diff --git a/openspec/specs/<b>/spec.md b/openspec/specs/<b>/spec.md',
    '--- a/openspec/specs/<b>/spec.md',
    '+++ b/openspec/specs/<b>/spec.md',
    '@@ -5,0 +6,2 @@',
    '+added',
    '+lines',
].join('\n');

describe('hunksOf', () => {
    test('reads the new-side range and the removed lines of every hunk under the file it belongs to', () => {
        expect(hunksOf(diff)).toEqual([
            { file: 'openspec/specs/<a>/spec.md', start: 12, count: 1, removed: [] },
            { file: 'openspec/specs/<a>/spec.md', start: 40, count: 3, removed: [] },
            { file: 'openspec/specs/<a>/spec.md', start: 60, count: 0, removed: ['gone'] },
            { file: 'openspec/specs/<b>/spec.md', start: 6, count: 2, removed: [] },
        ]);
    });

    test("files a deleted file's hunks under its old path, and reads a removed line that starts with dashes", () => {
        const deleted = [
            'diff --git a/db/drop.sql b/db/drop.sql',
            'deleted file mode 100644',
            '--- a/db/drop.sql',
            '+++ /dev/null',
            '@@ -1,2 +0,0 @@',
            '--- a comment',
            '-DROP TABLE orders;',
        ].join('\n');
        expect(hunksOf(deleted)).toEqual([
            { file: 'db/drop.sql', start: 0, count: 0, removed: ['-- a comment', 'DROP TABLE orders;'] },
        ]);
    });
});

describe('touches', () => {
    const hunks: Hunk[] = [{ file: 'a.ts', start: 10, count: 2, removed: [] }];

    test('covers the changed lines, widened by the context, or the whole file', () => {
        expect(touches(hunks, 'a.ts', 11, 11)).toBe(true);
        expect(touches(hunks, 'a.ts', 12, 20)).toBe(false);
        expect(touches(hunks, 'a.ts', 14, 20, 3)).toBe(true);
        expect(touches(hunks, 'a.ts', 15, 20, 3)).toBe(false);
        expect(touches(hunks, 'a.ts', 500, 500, 'file')).toBe(true);
        expect(touches(hunks, 'b.ts', 10, 11, 'file')).toBe(false);
    });
});

describe('requirementsTouched', () => {
    const all = [
        requirement('<a>', 'first', 9, 20),
        requirement('<a>', 'second', 21, 45),
        requirement('<a>', 'third', 46, 59),
        requirement('<a>', 'fourth', 60, 70),
        requirement('<b>', 'only', 3, 30),
        requirement('<c>', 'untouched', 1, 99),
    ];

    test('names each requirement a hunk overlaps, once, a deletion touching the block at its line', () => {
        expect(requirementsTouched(hunksOf(diff), all).map((r) => `${r.capability}#${r.slug}`)).toEqual([
            '<a>#first',
            '<a>#second',
            '<a>#fourth',
            '<b>#only',
        ]);
    });
});

describe('deltaRequirements', () => {
    const standing = (name: string, line: number, names: string[]): Requirement => ({
        ...requirement('cap', name.toLowerCase().replace(/\s+/g, '-'), line, line + 5),
        name,
        terms: terms(...names),
    });
    const all = [
        standing('Kept rule', 10, ['alpha', 'beta']),
        standing('Old name', 20, ['gamma']),
        standing('Neighbour', 30, ['delta', 'epsilon']),
        standing('Far', 40, ['zeta']),
    ];
    const delta = [
        '## ADDED Requirements',
        '',
        '### Requirement: Brand new',
        '',
        'Uses `delta` and `epsilon` and `alpha`.',
        '',
        '## MODIFIED Requirements',
        '',
        '### Requirement: Kept rule',
        '',
        'body',
        '',
        '## REMOVED Requirements',
        '',
        '### Requirement: Gone already',
        '',
        '## RENAMED Requirements',
        '',
        '- FROM: `### Requirement: Old name`',
        '- TO: `### Requirement: New name`',
    ].join('\n');

    test('parses the blocks by operation, a RENAMED entry by its FROM heading', () => {
        expect(deltaBlocks(delta).map((b) => [b.op, b.name])).toEqual([
            ['ADDED', 'Brand new'],
            ['MODIFIED', 'Kept rule'],
            ['REMOVED', 'Gone already'],
            ['RENAMED', 'Old name'],
        ]);
        expect(deltaBlocks(delta)[0]!.block).toContain('Uses `delta`');
    });

    test('maps MODIFIED, REMOVED and RENAMED-FROM headings to the standing requirement, and an ADDED one to its two nearest neighbours by shared terms', () => {
        expect(deltaRequirements(delta, 'cap', all).map((r) => r.name)).toEqual(['Neighbour', 'Kept rule', 'Old name']);
        expect(deltaRequirements(delta, 'other', all)).toEqual([]);
    });
});

describe('reachedBy', () => {
    const hunk = (file: string, start: number, count = 1, removed: string[] = []): Hunk => ({
        file,
        start,
        count,
        removed,
    });
    const hit = (term: string, file: string, ...lines: number[]): Term => ({
        term,
        hits: lines.map((line) => ({ file, line })),
    });
    const bound: Requirement = {
        ...requirement('cap', 'bound', 1, 5),
        bindings: [{ file: 'a.test.ts', line: 3, anchor: 'scenario-x', kind: 'test', title: 'x', window: [3, 9] }],
    };
    const sibling: Requirement = {
        ...requirement('cap', 'sibling', 6, 8),
        bindings: [{ file: 'a.test.ts', line: 20, anchor: 'scenario-y', kind: 'test', title: 'y', window: [20, 30] }],
    };
    const cited: Requirement = {
        ...requirement('cap', 'cited', 9, 12),
        pointers: [{ file: 'b.ts', line: 40, anchor: 'requirement-cited', kind: 'code', window: [40, 64] }],
    };
    const named: Requirement = { ...requirement('cap', 'named', 13, 15), terms: [hit('rareCall', 'c.ts', 7, 90)] };
    const common: Requirement = {
        ...requirement('cap', 'common', 16, 20),
        terms: [
            {
                term: 'everywhere',
                hits: [
                    ...Array.from({ length: 20 }, (_, i) => ({ file: `f${i}.ts`, line: 1 })),
                    { file: 'c.ts', line: 7 },
                ],
            },
        ],
    };
    const all = [bound, sibling, cited, named, common];
    const slugs = (hunks: Hunk[], context?: number | 'file') => reachedBy(hunks, all, context).map((r) => r.slug);

    test('reaches only the requirement whose bound test block a changed line falls in', () => {
        expect(slugs([hunk('a.test.ts', 5)], 0)).toEqual(['bound']);
        expect(slugs([hunk('a.test.ts', 25)], 0)).toEqual(['sibling']);
    });

    test('reaches a cited requirement when a changed line falls in the citation window, widened by the context', () => {
        expect(slugs([hunk('b.ts', 60)], 0)).toEqual(['cited']);
        expect(slugs([hunk('b.ts', 67)], 3)).toEqual(['cited']);
        expect(slugs([hunk('b.ts', 68)], 3)).toEqual([]);
    });

    test('reaches by a distinctive term on a changed line, not on another line of the file, unless the context is the file', () => {
        expect(slugs([hunk('c.ts', 7)], 0)).toEqual(['named']);
        expect(slugs([hunk('c.ts', 50)], 3)).toEqual([]);
        expect(slugs([hunk('c.ts', 50)], 'file')).toEqual(['named']);
    });

    test('reaches by a distinctive term on a line a source file lost, not one a test file lost or a comment', () => {
        expect(slugs([hunk('d.ts', 3, 0, ['    return rareCall(x);'])])).toEqual(['named']);
        expect(slugs([hunk('d.test.ts', 3, 0, ['    rareCall(x);'])])).toEqual([]);
        expect(slugs([hunk('d.ts', 3, 0, ['    // rareCall was here'])])).toEqual([]);
    });

    test('reaches everything in an untracked file, a hunk over all its lines', () => {
        expect(slugs([hunk('a.test.ts', 1, Number.MAX_SAFE_INTEGER)], 0)).toEqual(['bound', 'sibling']);
    });
});

describe('affectedOptions', () => {
    test('takes the defaults when nothing is set, and each variable when it is', () => {
        expect(affectedOptions({})).toEqual(AFFECTED_DEFAULTS);
        expect(
            affectedOptions({
                AUDIT_AFFECTED_CONTEXT: 'file',
                AUDIT_AFFECTED_HOPS: '0',
                AUDIT_AFFECTED_UNIT: 'capability',
            }),
        ).toEqual({ context: 'file', hops: 0, unit: 'capability' });
        expect(affectedOptions({ AUDIT_AFFECTED_CONTEXT: '10' }).context).toBe(10);
    });

    test('refuses a value it cannot use, naming the variable', () => {
        expect(() => affectedOptions({ AUDIT_AFFECTED_CONTEXT: 'all' })).toThrow(/AUDIT_AFFECTED_CONTEXT/);
        expect(() => affectedOptions({ AUDIT_AFFECTED_HOPS: '-1' })).toThrow(/AUDIT_AFFECTED_HOPS/);
        expect(() => affectedOptions({ AUDIT_AFFECTED_UNIT: 'file' })).toThrow(/AUDIT_AFFECTED_UNIT/);
    });
});

describe('grow', () => {
    const related = (r: Requirement, ...ids: string[]): Requirement => ({
        ...r,
        related: ids.map((id) => ({ id, shared: [] })),
    });
    const a1 = related(requirement('a', 'one', 1, 5), 'b#two');
    const a2 = requirement('a', 'other', 6, 9);
    const b2 = related(requirement('b', 'two', 1, 5), 'c#three');
    const b3 = requirement('b', 'sibling', 6, 9);
    const c3 = requirement('c', 'three', 1, 5);
    const e1 = requirement('e', 'edited', 1, 5);
    const all = [a1, a2, b2, b3, c3, e1];
    const ids = (hops: number, unit: 'requirement' | 'edited' | 'capability') =>
        grow([a1], all, ['e'], { hops, unit }).map((r) => `${r.capability}#${r.slug}`);

    test('adds the related requirements of the set for each hop, and none at zero', () => {
        expect(ids(0, 'requirement')).toEqual(['a#one']);
        expect(ids(1, 'requirement')).toEqual(['a#one', 'b#two']);
        expect(ids(2, 'requirement')).toEqual(['a#one', 'b#two', 'c#three']);
    });

    test('adds each edited capability whole for the edited unit, and every capability in the set for the capability unit', () => {
        expect(ids(1, 'edited')).toEqual(['a#one', 'b#two', 'e#edited']);
        expect(ids(1, 'capability')).toEqual(['a#one', 'b#two', 'a#other', 'b#sibling', 'e#edited']);
    });
});
