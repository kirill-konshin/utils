import { describe, expect, test } from 'vitest';

import { deltaBlocks, deltaRequirements, hunksOf, reachedBy, requirementsTouched } from './auditChanged';
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
    test('reads the new-side range of every hunk under the file it belongs to', () => {
        expect(hunksOf(diff)).toEqual([
            { file: 'openspec/specs/<a>/spec.md', start: 12, count: 1 },
            { file: 'openspec/specs/<a>/spec.md', start: 40, count: 3 },
            { file: 'openspec/specs/<a>/spec.md', start: 60, count: 0 },
            { file: 'openspec/specs/<b>/spec.md', start: 6, count: 2 },
        ]);
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
    const hit = (term: string, ...files: string[]): Term => ({ term, hits: files.map((file) => ({ file, line: 1 })) });
    const bound: Requirement = {
        ...requirement('cap', 'bound', 1, 5),
        bindings: [{ file: 'a.test.ts', line: 3, anchor: 'scenario-x', kind: 'test', title: 'x', window: [3, 9] }],
    };
    const cited: Requirement = {
        ...requirement('cap', 'cited', 6, 9),
        pointers: [{ file: 'b.ts', line: 7, anchor: 'requirement-cited', kind: 'code' }],
    };
    const named: Requirement = { ...requirement('cap', 'named', 10, 15), terms: [hit('rareCall', 'c.ts')] };
    const common: Requirement = {
        ...requirement('cap', 'common', 16, 20),
        terms: [hit('everywhere', ...Array.from({ length: 20 }, (_, i) => `f${i}.ts`), 'c.ts')],
    };
    const all = [bound, cited, named, common];

    test('reaches the requirements a changed test binds and a changed file cites', () => {
        expect(reachedBy(new Set(['a.test.ts', 'b.ts']), all).map((r) => r.slug)).toEqual(['bound', 'cited']);
    });

    test('reaches the requirements whose distinctive terms a changed file contains, though nothing in it cites them', () => {
        expect(reachedBy(new Set(['c.ts']), all).map((r) => r.slug)).toEqual(['named']);
        expect(reachedBy(new Set(['f3.ts']), all)).toEqual([]);
    });
});
