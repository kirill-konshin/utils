import { describe, expect, test } from 'vitest';

import {
    COMMON_TOKEN_LIMIT,
    contextOf,
    distinctiveTerms,
    type EvidenceRequirement,
    excerpt,
    idOf,
    MAX_CANDIDATE_LINES_PER_FILE,
    MAX_EXCERPT_LINES,
    occurrences,
    PART_BYTES,
    renderCapability,
    renderRequirement,
    requirementsOf,
    WHOLE_FILE_LINES,
    WINDOW_LINES,
} from './auditParts';
import { toYaml } from './data';

const source = [
    "import x from 'y';",
    '',
    '/**',
    ' * One.',
    ' * {@link openspec/specs/<a>/spec.md#requirement-one}',
    ' */',
    'export function one() {',
    '    return x;',
    '}',
    '',
    'export class K {',
    '    /** {@link openspec/specs/<a>/spec.md#requirement-two} */',
    '    two() {',
    '        return 2;',
    '    }',
    '',
    '    other() {',
    '        return 0;',
    '    }',
    '}',
    '',
    "describe('suite', () => {",
    '    /** {@link openspec/specs/<a>/spec.md#requirement-three} */',
    "    it('three', () => {",
    '        expect(1).toBe(1);',
    '    });',
    '',
    "    it('long', () => {",
    ...Array.from(
        { length: MAX_EXCERPT_LINES },
        (_, i) => `        step(${i}); // {@link openspec/specs/<a>/spec.md#requirement-four}`,
    ),
    '    });',
    '});',
    '',
].join('\n');

const lineOf = (needle: string) => source.split('\n').findIndex((l) => l.includes(needle)) + 1;

/**
 * The evidence is a function of the sources and the citations — tested here as such; what this
 * branch's evidence is, is repository state and belongs to the job that writes it.
 */
describe('excerpt', () => {
    test('takes the declaration a JSDoc citation precedes, from its comment to its end', () => {
        const e = excerpt('a.ts', source, lineOf('#requirement-one'));
        expect(e.cut).toBe(false);
        expect(e.startLine).toBe(3);
        expect(e.text).toContain('   7│ export function one()');
        expect(e.text).not.toContain('class K');
    });

    test('takes one member of a class, not the class', () => {
        const e = excerpt('a.ts', source, lineOf('#requirement-two'));
        expect(e.cut).toBe(false);
        expect(e.text).toContain('two()');
        expect(e.text).not.toContain('other()');
    });

    test('takes one test of a suite too long to quote whole', () => {
        const e = excerpt('a.test.ts', source, lineOf('#requirement-three'));
        expect(e.cut).toBe(false);
        expect(e.text).toContain("it('three'");
        expect(e.text).not.toContain("it('long'");
    });

    test('falls back to a numbered window when every enclosing declaration is past the budget', () => {
        const line = lineOf('step(40)');
        const e = excerpt('a.test.ts', source, line);
        expect(e.cut).toBe(true);
        expect(e.startLine).toBe(line - WINDOW_LINES);
        expect(e.text.split('\n')).toHaveLength(2 * WINDOW_LINES + 1);
        expect(e.text).toContain(`${String(line).padStart(4)}│`);
    });

    test('quotes a short file whole for a citation above its imports, bodies included', () => {
        const header = [
            '/**',
            ' * File-level.',
            ' * {@link openspec/specs/<a>/spec.md#requirement-five}',
            ' */',
            '',
        ].join('\n');
        const e = excerpt('a.test.ts', header + source, 3);
        expect(e.cut).toBe(false);
        expect(e.startLine).toBe(1);
        expect(e.text).toContain('   3│  * {@link');
        expect(e.text).toContain('expect(1).toBe(1);');
    });

    test('outlines a long file for a citation above its imports: declarations and test titles with their lines', () => {
        const header = [
            '/**',
            ' * File-level.',
            ' * {@link openspec/specs/<a>/spec.md#requirement-five}',
            ' */',
            '',
        ].join('\n');
        const padding = Array.from({ length: WHOLE_FILE_LINES }, (_, i) => `const pad${i} = ${i};`).join('\n') + '\n';
        const e = excerpt('a.test.ts', header + source + padding, 3);
        expect(e.cut).toBe(true);
        expect(e.startLine).toBe(1);
        expect(e.text).toContain('   3│  * {@link');
        expect(e.text).toContain('outline of the file');
        expect(e.text).toMatch(/│ Function one/);
        expect(e.text).toMatch(/│ Class K/);
        expect(e.text).toMatch(/│ describe\('suite'\)/);
        expect(e.text).toMatch(/│ it\('three'\)/);
        expect(e.text).not.toContain('import x');
    });

    test('treats a comment above a fixture in a test file as file-level, and quotes a test block alone', () => {
        const header = ['/** {@link openspec/specs/<a>/spec.md#requirement-six} */', 'const fixture = 1;', ''].join(
            '\n',
        );
        const padding = Array.from({ length: WHOLE_FILE_LINES }, (_, i) => `const pad${i} = ${i};`).join('\n') + '\n';
        const e = excerpt('a.test.ts', header + source + padding, 1);
        expect(e.cut).toBe(true);
        expect(e.text).toContain('outline of the file');
        expect(e.text).toMatch(/│ it\('three'\)/);
        expect(excerpt('a.test.ts', source, lineOf('#requirement-three')).cut).toBe(false);
    });

    test('quotes a short non-TypeScript file whole, and windows a long one', () => {
        const short = excerpt('Dockerfile', 'FROM a\nRUN b\n', 2);
        expect(short).toEqual({ startLine: 1, text: '   1│ FROM a\n   2│ RUN b\n   3│ ', cut: false });
        const long = excerpt(
            'docker-compose.yml',
            Array.from({ length: WHOLE_FILE_LINES + 1 }, (_, i) => `k${i}: v`).join('\n'),
            100,
        );
        expect(long.cut).toBe(true);
        expect(long.startLine).toBe(100 - WINDOW_LINES);
    });
});

/** The evidence model as spec-steward writes it, for one requirement and the one it is related to. */
const sources: Record<string, string> = {
    'apps/x/src/a.ts': 'export function attach() {\n    return selectMethod();\n}\n',
    'apps/x/src/a.test.ts':
        "import { it } from 'vitest';\n\n/** the test */\nit('attaches', () => {\n    expect(attach()).toBe(1);\n});\n",
    'apps/x/src/b.ts': 'const selectMethod = 1;\nconst pad = 0;\nconst path = selectMethod;\n',
};
const modelRequirement = (over: Partial<EvidenceRequirement> = {}): EvidenceRequirement => ({
    id: 'x#requirement-attach',
    capability: 'x',
    file: 'openspec/specs/x/spec.md',
    line: 9,
    end: 16,
    block: '### Requirement: Attach\n\n**⚠️ Advisory:** reviewed.\n\nThe client SHALL attach via `selectMethod`.\n\n#### Scenario: Attach\n\n- **WHEN** x\n- **THEN** y',
    class: 'advisory',
    gaps: [],
    scenarios: [{ slug: 'scenario-attach', line: 13, end: 16, block: '#### Scenario: Attach', bound: true }],
    bindings: [
        {
            file: 'apps/x/src/a.test.ts',
            line: 3,
            anchor: 'scenario-attach',
            kind: 'test',
            title: 'attaches',
            window: [3, 6],
        },
    ],
    pointers: [{ file: 'apps/x/src/a.ts', line: 1, anchor: 'requirement-attach', kind: 'code' }],
    terms: [
        {
            term: 'selectMethod',
            hits: [
                { file: 'apps/x/src/a.ts', line: 2 },
                { file: 'apps/x/src/b.ts', line: 1 },
                { file: 'apps/x/src/b.ts', line: 3 },
            ],
        },
    ],
    related: [{ id: 'y#requirement-other', shared: ['selectMethod'] }],
    ...over,
});
const other = modelRequirement({
    id: 'y#requirement-other',
    capability: 'y',
    file: 'openspec/specs/y/spec.md',
    block: '### Requirement: Other\n\nThe server SHALL answer `selectMethod`.',
    class: 'required',
    bindings: [],
    pointers: [],
    related: [],
});
const model = (first = modelRequirement()) => requirementsOf({ version: 1, root: 'x', requirements: [first, other] });
const reader = (files: Record<string, string>) => (file: string) => files[file]?.split('\n');

describe('requirementsOf', () => {
    test("reads spec-steward's model: the slug from the id, the class, and the statement past any marker line", () => {
        const [r, o] = model();
        expect(r).toMatchObject({ capability: 'x', slug: 'requirement-attach', name: 'Attach', advisory: true });
        expect(r!.statement).toBe('The client SHALL attach via `selectMethod`.');
        expect(r!.scenarioSlugs).toEqual(['scenario-attach']);
        expect(o!.advisory).toBe(false);
    });
});

describe('occurrences', () => {
    test('ranks files by the distinctive terms they share, caps the lines per file, and shows the source line', () => {
        const terms = [
            { term: 'rare', hits: [{ file: 'b.ts', line: 2 }] },
            {
                term: 'common',
                hits: [1, 2, 3, 4, 5].map((line) => ({ file: 'a.ts', line })),
            },
        ];
        const read = reader({ 'a.ts': 'l1\nl2\nl3\nl4\nl5', 'b.ts': 'x\n  rare();\n' });
        const found = occurrences(terms, new Set(['rare']), read);
        expect(found.map((c) => c.file)).toEqual(['b.ts', 'a.ts']);
        expect(found[0]!.hits).toEqual([{ file: 'b.ts', line: 2, term: 'rare', text: 'rare();' }]);
        expect(found[1]!.hits).toHaveLength(MAX_CANDIDATE_LINES_PER_FILE);
    });

    test('calls a term distinctive when few requirements name it and few files carry it', () => {
        const all = model();
        expect(distinctiveTerms(all)).toEqual(new Set(['selectMethod']));
        const many = Array.from({ length: COMMON_TOKEN_LIMIT + 1 }, (_, i) =>
            modelRequirement({ id: `c#requirement-${i}`, capability: 'c' }),
        );
        expect(distinctiveTerms(requirementsOf({ version: 1, root: 'x', requirements: many })).size).toBe(0);
    });
});

describe('renderRequirement', () => {
    test('carries the requirement verbatim, its bound tests quoted, where its terms occur, and its related requirements, never what cites it', () => {
        const all = model();
        const e = renderRequirement(all[0]!, contextOf(all, reader(sources)));
        expect(e).toMatchObject({ id: 'x#requirement-attach', location: 'openspec/specs/x/spec.md:9', advisory: true });
        expect(e.block).toBe(all[0]!.block);
        // The bound test, quoted whole with the files' own line numbers and the anchor it binds.
        expect(e.boundTests[0]).toMatchObject({
            location: 'apps/x/src/a.test.ts:3',
            title: 'attaches',
            binds: ['#scenario-attach (:3)'],
        });
        expect(e.boundTests[0]!.code).toContain("   4│ it('attaches', () => {");
        // Where its terms occur: the source lines, comment-stripped by spec-steward, ranked.
        expect(e.occurrences).toContainEqual(
            expect.objectContaining({ file: 'apps/x/src/b.ts', shares: ['selectMethod'] }),
        );
        expect(e.occurrences.flatMap((o) => o.hits)).toContainEqual({
            location: 'apps/x/src/a.ts:2',
            text: 'return selectMethod();',
        });
        // What cites it is not evidence, and is left out.
        const text = toYaml(e);
        expect(text).not.toContain('apps/x/src/a.ts:1');
        expect(text).not.toContain('   1│ export function attach()');
        expect(e.related).toContainEqual({
            id: 'y#requirement-other',
            shared: ['selectMethod'],
            statement: 'The server SHALL answer `selectMethod`.',
        });
    });

    test('quotes a bound test inside a bound suite once, under the suite, naming both bindings', () => {
        const suite =
            "describe('suite', () => {\n    /** the test */\n    it('one', () => {\n        expect(1).toBe(1);\n    });\n});\n";
        const binding = (line: number, anchor: string) =>
            ({ file: 's.test.ts', line, anchor, kind: 'test', title: null, window: [line, 6] }) as const;
        const [r] = requirementsOf({
            version: 1,
            root: 'x',
            requirements: [
                modelRequirement({
                    bindings: [binding(2, 'scenario-one'), binding(1, 'requirement-attach')],
                    terms: [],
                    related: [],
                }),
            ],
        });
        const e = renderRequirement(r!, contextOf([r!], reader({ 's.test.ts': suite })));
        expect(e.boundTests).toHaveLength(1);
        expect(e.boundTests[0]!.binds).toEqual(['#requirement-attach (:1)', '#scenario-one (:2)']);
    });

    test('says so when nothing binds it and when it names no term', () => {
        const [bare] = requirementsOf({
            version: 1,
            root: 'x',
            requirements: [modelRequirement({ bindings: [], terms: [], pointers: [], related: [] })],
        });
        const e = renderRequirement(bare!, contextOf([bare!], reader(sources)));
        expect(e.boundTests).toEqual([]);
        expect(e.termsNote).toContain('The requirement names no term.');
        expect(e.related).toBeUndefined();
    });
});

describe('renderCapability', () => {
    const spec = '# x\n\n## Purpose\n\nThe purpose of x.\n\n## Requirements\n';
    /** A requirement of capability `x` whose block is about `kb` kilobytes. */
    const sized = (i: number, kb: number) =>
        modelRequirement({
            id: `x#requirement-r${i}`,
            block: `### Requirement: R${i}\n\n${'The client SHALL attach. '.repeat(Math.round((kb * 1024) / 25))}`,
            scenarios: [],
            bindings: [],
            pointers: [],
            terms: [],
            related: [],
        });
    /** A requirement of this share of one reader's evidence, in KB: sized against PART_BYTES, whatever it is. */
    const share = (fraction: number) => Math.round((PART_BYTES / 1024) * fraction);
    const cut = (...kbs: number[]) => {
        const all = requirementsOf({ version: 1, root: 'x', requirements: kbs.map((kb, i) => sized(i, kb)) });
        return { all, slices: renderCapability('x', contextOf(all, reader({ 'openspec/specs/x/spec.md': spec }))) };
    };

    test('keeps a capability one reader holds as one file, with its Purpose', () => {
        const { all, slices } = cut(20, 20);
        expect(slices).toHaveLength(1);
        expect(slices[0]!.requirements).toEqual(all);
        expect(slices[0]!.text).toContain('The purpose of x.');
        expect(slices[0]!.text).not.toContain('cut between its requirements');
    });

    test('cuts a larger capability between its requirements, in their order, each file within one reader', () => {
        const { all, slices } = cut(...Array.from({ length: 6 }, () => share(0.4)));
        expect(slices.length).toBeGreaterThan(1);
        expect(slices.flatMap((s) => s.requirements.map(idOf))).toEqual(all.map(idOf));
        for (const s of slices) {
            expect(Buffer.byteLength(s.text)).toBeLessThanOrEqual(PART_BYTES);
            expect(s.text).toContain('The purpose of x.');
            expect(s.text).toContain('cut between its requirements');
        }
        // The same evidence, the same cut — every job that reads the scope sees it alike.
        expect(cut(...Array.from({ length: 6 }, () => share(0.4))).slices).toEqual(slices);
    });

    test('gives a requirement larger than one reader holds a file of its own', () => {
        const { slices } = cut(share(0.4), share(1.4), share(0.4));
        expect(slices.map((s) => s.requirements.map((r) => r.slug))).toEqual([
            ['requirement-r0'],
            ['requirement-r1'],
            ['requirement-r2'],
        ]);
        expect(Buffer.byteLength(slices[1]!.text)).toBeGreaterThan(PART_BYTES);
    });
});
