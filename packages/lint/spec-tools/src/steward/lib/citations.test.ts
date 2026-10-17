import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { cleanTempDirs, SPEC, SPEC_FILE, cite, repo, check, anchorsOf } from '../steward.fixture';
import { scanCitations } from './citations';
import { blockAt, stripComments, testBlocks } from './scan';
import { globToRegExp } from './util';

// Every case drives git; on a loaded machine one process start can take seconds.
vi.setConfig({ testTimeout: 300_000 });

afterEach(cleanTempDirs);

describe('citation scanning', () => {
    test('reads comments and documents in every text file outside change folders, never strings or URLs', () => {
        const dir = repo({
            [SPEC_FILE]: SPEC,
            'apps/api/Dockerfile': 'FROM node\n# openspec/specs/demo/spec.md#requirement-gone\n',
            'apps/web/web.Dockerfile': 'FROM node\n# openspec/specs/demo/spec.md#scenario-a-confirmation-succeeds\n',
            'chart/templates/_helpers.tpl': '{{/* openspec/specs/demo/spec.md#requirement-gone-too */}}\n',
            '.env.example': '# openspec/specs/nowhere/spec.md\nKEY=1\n',
            'apps/api/src/a.ts': [
                "const fixture = '// {@link openspec/specs/nowhere/spec.md}';",
                '// see https://example.com/blob/main/openspec/specs/elsewhere/spec.md',
                `/** ${cite('requirement-orders-are-confirmed-once')} */`,
            ].join('\n'),
            'apps/api/src/a.test.ts': [
                "test('reads a fixture', () => {",
                "    const spec = 'openspec/specs/nowhere/spec.md#scenario-x';",
                '    expect(`// {@link openspec/specs/nowhere/spec.md}`).toContain(spec);',
                '});',
            ].join('\n'),
            'docs/guide.md': 'Read openspec/specs/demo/spec.md#requirement-payloads-stay-lean.\n',
            'openspec/changes/x/proposal.md': 'OTHER openspec/specs/embedding/spec.md\n',
        });
        const citations = scanCitations(dir, anchorsOf);
        expect(citations.filter((c) => !c.resolves).map((c) => c.file)).toEqual([
            '.env.example',
            'apps/api/Dockerfile',
            'chart/templates/_helpers.tpl',
        ]);
        expect(citations.map((c) => [c.file, c.binding, c.resolves])).toEqual(
            expect.arrayContaining([
                ['apps/api/src/a.ts', null, true],
                ['apps/web/web.Dockerfile', null, true],
                ['docs/guide.md', null, true],
            ]),
        );
        expect(citations.filter((c) => /^openspec\/changes\/|\.test\.ts$/.test(c.file))).toEqual([]);
        expect(citations).toHaveLength(6);
        expect(check(dir).findings.filter((f) => /^openspec\/changes\/|\.test\.ts$/.test(f.file))).toEqual([]);
    });

    test('a test citation binds inside a test call or in the comment run directly above it, nowhere else', () => {
        const text = [
            `// ${cite('scenario-header')}`, // 1: a file header
            "import { x } from './x';",
            '',
            '/**',
            ` * ${cite('scenario-attached')}`, // 5: attached above describe.each
            ' */',
            "describe.each([[1], [2]])('table %s', (n) => {",
            "    test.skip('inner', () => {",
            `        expect(String(n)).toMatch(/\\(/); // ${cite('scenario-inside')}`, // 9: inside a test
            '    });',
            '});',
            '',
            `// ${cite('scenario-type')}`, // 13: attached above a type assertion
            'type _pin = Expect<',
            '    Equal<A, B>',
            '>;',
            '',
            `// ${cite('scenario-detached')}`, // 18: a blank line before the call
            '',
            "it('after a blank line', () => {});",
            '',
            `// ${cite('scenario-call')}`, // 22: attached above an expectTypeOf call
            'expectTypeOf(f).returns.toEqualTypeOf<1>();',
            `assertType<1>(f()); // ${cite('scenario-assert')}`, // 24: on an assertType call
        ].join('\n');
        const blocks = testBlocks('x.test.ts', text);
        expect([1, 5, 9, 13, 18, 22, 24].map((l) => blockAt(blocks, l)?.title ?? null)).toEqual([
            null,
            'table %s',
            'inner',
            '_pin',
            null,
            'expectTypeOf',
            'expectTypeOf',
        ]);
        expect(blockAt(blocks, 9)).toMatchObject({ start: 8, end: 10, kind: 'test' });
        expect(blockAt(blocks, 13)).toMatchObject({ start: 14, end: 16, kind: 'type' });
        expect(blockAt(blocks, 22)).toMatchObject({ start: 23, end: 23, kind: 'type' });
        expect(blockAt(blocks, 24)).toMatchObject({ start: 24, end: 24, kind: 'type' });
    });

    test('comments are blanked for term searches, line numbers kept', () => {
        expect(stripComments('a.ts', "const a = 'x'; // confirmOrder\n/* confirmOrder */ confirmOrder();")).toBe(
            `const a = 'x'; ${' '.repeat(15)}\n${' '.repeat(18)} confirmOrder();`,
        );
        expect(stripComments('a.yml', 'key: confirmOrder # confirmOrder\n# x')).toBe('key: confirmOrder \n');
    });

    test('a glob spans directories with ** and stays in one with *', () => {
        expect(globToRegExp('scripts/checks/**').test('scripts/checks/a/b.mjs')).toBe(true);
        expect(globToRegExp('**/*.Dockerfile').test('cards.Dockerfile')).toBe(true);
        expect(globToRegExp('**/*.Dockerfile').test('apps/x/web.Dockerfile')).toBe(true);
        expect(globToRegExp('*.yml').test('a/b.yml')).toBe(false);
        expect(globToRegExp('.gitlab-ci.{yml,yaml}').test('.gitlab-ci.yaml')).toBe(true);
    });
});
