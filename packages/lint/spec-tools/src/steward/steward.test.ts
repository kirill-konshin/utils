import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { applyFixes } from './lib/checks';
import { loadCorpus, parseSpec } from './lib/corpus';
import {
    cleanTempDirs,
    dirs,
    SPEC,
    SPEC_FILE,
    requirement,
    cite,
    git,
    write,
    repo,
    check,
    steward,
} from './steward.fixture';

// Every case drives git; on a loaded machine one process start can take seconds.
vi.setConfig({ testTimeout: 300_000 });

afterEach(cleanTempDirs);

describe('check', () => {
    test('flags what a reader should judge, and gates only a citation that does not resolve', () => {
        const dir = repo({
            [SPEC_FILE]: SPEC,
            'apps/api/src/order.ts': [
                `/** ${cite('requirement-orders-are-confirmed-once')} */`,
                'export const confirm = () => 1;',
                `// ${cite('requirement-gone')}`,
                "export const fixture = 'openspec/specs/nowhere/spec.md';",
            ].join('\n'),
            'apps/api/src/order.test.ts': [
                "import { readFileSync } from 'node:fs';",
                `/** ${cite('scenario-a-confirmation-times-out')} */`,
                "test('source says so', () => { expect(readFileSync('src/order.ts', 'utf8')).toContain('confirm'); });",
            ].join('\n'),
        });
        const { of, findings } = check(dir);
        expect(findings.filter((f) => f.severity === 'error').map((f) => `${f.kind} ${f.file}:${f.line}`)).toEqual([
            'dangling-citation apps/api/src/order.ts:3',
        ]);
        expect(of('textual-test')).toHaveLength(1);
        expect(of('unbound-test')[0].message).toContain('confirmOrder');
        expect(of('vague-obligation')[0].message).toContain('lean');
        expect(of('impl-detail')[0].message).toContain('apps/api/src/payload.ts');
        expect(
            of('restating-scenario')
                .map((f) => f.message)
                .join(),
        ).toContain('Lean payload');
        expect([...of('non-ears'), ...of('non-bdd'), ...of('scenario-unproven')]).toEqual([]);
    });

    test('a citation whose capability, requirement or scenario was renamed or removed fails the build', () => {
        const dir = repo({
            [SPEC_FILE]: SPEC,
            'apps/api/src/order.ts': [
                `// ${cite('requirement-payloads-stay-lean')}`,
                `// ${cite('scenario-a-confirmation-succeeds')}`,
                '// openspec/specs/demo/spec.md',
            ].join('\n'),
        });
        const dangling = () =>
            check(dir)
                .of('dangling-citation')
                .map((f) => `${f.severity} ${f.line} ${f.message}`);
        expect(dangling()).toEqual([]);

        write(
            dir,
            SPEC_FILE,
            SPEC.replace(/\n### Requirement: Payloads[\s\S]*$/, '\n').replace(
                'Scenario: A confirmation succeeds',
                'Scenario: A confirmation answers',
            ),
        );
        expect(dangling()).toEqual([
            `error 1 ${SPEC_FILE}#requirement-payloads-stay-lean: anchor #requirement-payloads-stay-lean not found`,
            `error 2 ${SPEC_FILE}#scenario-a-confirmation-succeeds: anchor #scenario-a-confirmation-succeeds not found`,
        ]);

        fs.renameSync(path.join(dir, 'openspec/specs/demo'), path.join(dir, 'openspec/specs/orders'));
        expect(dangling()).toEqual([
            `error 1 ${SPEC_FILE}#requirement-payloads-stay-lean: file does not exist`,
            `error 2 ${SPEC_FILE}#scenario-a-confirmation-succeeds: file does not exist`,
            `error 3 ${SPEC_FILE}: file does not exist`,
        ]);
        expect(steward(dir, ['check']).status).toBe(1);
    });

    test('the CLI prints one finding per line, a summary on stderr, exits 0 or 1; --strict fails on a warning', () => {
        const dir = repo({
            [SPEC_FILE]: SPEC.replace('The service SHALL keep', '**Advisory:** taste.\n\nThe service SHALL keep'),
        });
        const res = steward(dir, ['check']);
        expect(res.status).toBe(0);
        expect(res.stdout).toMatch(/^openspec\/specs\/demo\/spec\.md:\d+ warn marker-hygiene marker should read/m);
        expect(res.stderr).toMatch(
            /base: none — no --base\n\d+ finding\(s\): .*\nPASS — 0 error\(s\), 1 warning\(s\), \d+ prompt\(s\)\n$/,
        );
        const strict = steward(dir, ['check', '--strict', '--json']);
        expect(strict.status).toBe(1);
        expect(JSON.parse(strict.stdout)[0]).toEqual({
            root: path.basename(dir),
            file: SPEC_FILE,
            line: 25,
            severity: 'warn',
            kind: 'marker-hygiene',
            id: 'demo#requirement-payloads-stay-lean',
            message: 'marker should read **⚠️ Advisory:**',
        });
    });

    test('reports weakening against the base and repairs a renamed anchor', () => {
        const dir = repo({
            [SPEC_FILE]: SPEC,
            'apps/api/src/order.test.ts': `/** ${cite('scenario-a-confirmation-succeeds')} */\ntest('x', () => {});\n`,
        });
        write(
            dir,
            SPEC_FILE,
            SPEC.replace(
                'SHALL confirm an order exactly once and MUST NOT retry',
                'SHOULD confirm an order once and SHOULD NOT retry',
            ).replace('#### Scenario: A confirmation succeeds', '#### Scenario: A confirmation answers'),
        );
        const { of, findings } = check(dir, { base: 'main' });
        expect(of('weakened')[0].message).toMatch(/MUST\/SHALL 2 → 0/);
        expect(of('renamed-anchor')[0].message).toContain('scenario-a-confirmation-answers');
        expect(of('dangling-citation')).toEqual([]);

        expect(applyFixes(dir, findings)).toEqual(['apps/api/src/order.test.ts']);
        expect(fs.readFileSync(path.join(dir, 'apps/api/src/order.test.ts'), 'utf8')).toContain(
            '#scenario-a-confirmation-answers}',
        );
        expect(check(dir, { base: 'main' }).findings.filter((f) => f.severity === 'error')).toEqual([]);
    });

    test('a requirement newly marked advisory is weakened', () => {
        const dir = repo({ [SPEC_FILE]: SPEC });
        write(
            dir,
            SPEC_FILE,
            SPEC.replace('The service SHALL keep', '**⚠️ Advisory:** a judgement.\n\nThe service SHALL keep'),
        );
        expect(check(dir, { base: 'main' }).of('weakened')[0].message).toContain('newly marked advisory');
    });

    test('one requirement name in two capabilities, or one text in two requirements, is a duplicate', () => {
        const other = SPEC.replace('# demo', '# other').replace(/### Requirement: Payloads[\s\S]*$/, '');
        const dir = repo({
            [SPEC_FILE]: SPEC,
            'openspec/specs/other/spec.md': other,
            'openspec/specs/third/spec.md': other.replace('Orders are confirmed once', 'Orders confirm once'),
        });
        const dups = check(dir).of('duplicate-requirement');
        expect(dups.map((f) => [f.file, f.severity, f.message.slice(0, 12)])).toEqual([
            ['openspec/specs/other/spec.md', 'error', '"Orders are '],
            ['openspec/specs/other/spec.md', 'error', 'same text as'],
            ['openspec/specs/third/spec.md', 'error', 'same text as'],
        ]);
    });
});

describe('size', () => {
    test('counts RFC 2119 keywords outside backticks, a NOT form once, marker lines excluded', () => {
        const statement =
            'The gate MUST run. It SHALL NOT skip `MUST`. It is REQUIRED, RECOMMENDED and OPTIONAL. It NEVER, ALWAYS waits.';
        const spec = `${SPEC}${requirement('Counting', statement, ['One'], '\n**⚠️ Advisory:** MUST MUST MUST.\n')}`;
        const r = parseSpec(spec, 'x', 'x').requirements.find((x) => x.name === 'Counting');
        expect(r!.strong + r!.weak).toBe(5);
        const example =
            'The gate MUST run. It SHALL NOT skip `MUST`; it MAY warn, is NEVER silent and ALWAYS logs; logging is RECOMMENDED.';
        const [e] = parseSpec(requirement('Example', example, ['One']), 'x', 'x').requirements;
        expect(e.strong + e.weak).toBe(4);
    });

    test('over the prompt line is a prompt, over the failing line an error; both lines are settable', () => {
        const long = `The service SHALL ${'answer '.repeat(320)}.`;
        const longest = `The service SHALL ${'reply '.repeat(500)}.`;
        const spec = `${SPEC}${requirement('Long', long, ['One'])}${requirement('Many', 'It MUST a, MUST b, MUST c, MUST d, MUST e, MUST f.', ['Two'])}${requirement('Longest', longest, ['Three'])}`;
        const dir = repo({ [SPEC_FILE]: spec });
        const sizes = (opts: Record<string, unknown>) =>
            check(dir, opts)
                .of('size')
                .map((f) => `${f.line} ${f.severity} ${f.message.split(' — ')[0]}`);
        const [long1, many, longest1] = ['Long', 'Many', 'Longest'].map(
            (n) => spec.split('\n').indexOf(`### Requirement: ${n}`) + 1,
        );
        expect(sizes({})).toEqual([
            `${long1} info 339 words (> 300)`,
            `${many} info 6 obligations in the statement (> 5)`,
            `${longest1} error 519 words (> 500)`,
        ]);
        expect(sizes({ 'max-words': '200,300', 'max-obligations': '3,5' })).toEqual([
            `${long1} error 339 words (> 300)`,
            `${many} error 6 obligations in the statement (> 5)`,
            `${longest1} error 519 words (> 300)`,
        ]);
    });
});

describe('markers', () => {
    const marked = (line: string) => SPEC.replace('The service SHALL keep', `${line}\n\nThe service SHALL keep`);

    test('only Advisory and a tracked Known gap are read; the rest warn and grant nothing', () => {
        const dir = repo({
            [SPEC_FILE]: `${marked('**⚠️ Unenforced:** old.')}${requirement('Inline', 'It SHALL hold. **⚠️ Known gap:** inline.', ['One'])}${requirement('Scenario advisory', 'It SHALL hold.', ['Two'])}\n**⚠️ Advisory:** in a scenario.\n`,
        });
        expect(
            check(dir)
                .of('marker-hygiene')
                .map((f) => [f.severity, f.message]),
        ).toEqual([
            ['warn', expect.stringMatching(/^\*\*⚠️ Unenforced:\*\* is retired and grants nothing/)],
            ['warn', expect.stringMatching(/^a Known gap marker inside a line is not read/)],
            ['warn', expect.stringMatching(/^Advisory is the requirement's class/)],
        ]);
        const reqs = loadCorpus(dir).capabilities[0].requirements;
        expect(reqs.map((r) => [r.advisory, r.gaps.length])).toEqual([
            [false, 0],
            [false, 0],
            [false, 0],
            [false, 0],
        ]);
    });

    test('a misspelled marker is fixed to its canonical form, keeping its tracker', () => {
        const dir = repo({ [SPEC_FILE]: marked('**Known gap (PROJ-7):** not yet.') });
        const { of, findings } = check(dir);
        expect(of('marker-hygiene').map((f) => f.message)).toEqual(['marker should read **⚠️ Known gap (PROJ-7):**']);
        applyFixes(dir, findings);
        expect(fs.readFileSync(path.join(dir, SPEC_FILE), 'utf8')).toContain('**⚠️ Known gap (PROJ-7):** not yet.');
        expect(check(dir).of('marker-hygiene')).toEqual([]);
    });

    test('absolute-unproven prompts a REQUIRED absolute with no named exception and nothing binding it', () => {
        const absolute = (statement: string, extra = '') =>
            `${SPEC}${requirement('Absolute', statement, ['One'], extra)}`;
        const prompts = (spec: string, files: Record<string, string> = {}) =>
            check(repo({ [SPEC_FILE]: spec, ...files }))
                .of('absolute-unproven')
                .map((f) => f.id);
        expect(prompts(absolute('Every refund SHALL be logged.'))).toEqual(['demo#requirement-absolute']);
        expect(prompts(absolute('Every refund SHALL be logged, except a test refund.'))).toEqual([]);
        expect(prompts(absolute('Every refund SHALL be logged.', '\n**⚠️ Advisory:** review.\n'))).toEqual([]);
        expect(
            prompts(absolute('Every refund SHALL be logged.'), {
                'a.test.ts': `test('t', () => {}); // ${cite('scenario-one')}\n`,
            }),
        ).toEqual([]);
    });
});

describe('exit 2', () => {
    test('an unknown flag, a missing base ref, no upstream, a missing specs directory, a tree git cannot list', () => {
        const dir = repo({ [SPEC_FILE]: SPEC });
        const two = (cwd: string, args: string[], env?: Record<string, string>) => {
            const res = steward(cwd, args, { env });
            const lines = res.stderr.split('\n').filter((l) => l.startsWith('spec-tools steward: '));
            return [res.status, lines.pop() ?? res.stderr];
        };
        expect(two(dir, ['check', '--marker', 'x'])).toEqual([2, 'spec-tools steward: check: unknown flag --marker']);
        expect(two(dir, ['check', '--base', 'nope'])).toEqual([
            2,
            'spec-tools steward: base ref nope not found — git fetch origin',
        ]);
        expect(
            two(dir, ['check', '--base', 'auto'], { CI: 'true', CI_MERGE_REQUEST_DIFF_BASE_SHA: 'f'.repeat(40) }),
        ).toEqual([2, `spec-tools steward: CI_MERGE_REQUEST_DIFF_BASE_SHA ${'f'.repeat(40)} is not in this clone`]);
        git(dir, 'update-ref', '-d', 'refs/remotes/origin/main');
        expect(two(dir, ['check', '--base', 'auto'])).toEqual([2, expect.stringContaining('git fetch origin')]);
        expect(two(dir, ['coverage', '--specs', 'nowhere'])[1]).toContain('no specs directory nowhere');
        const bare = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'steward-bare-')));
        dirs.push(bare);
        write(bare, SPEC_FILE, SPEC);
        expect(two(bare, ['evidence', '--json'])).toEqual([2, expect.stringContaining('git lists no files')]);
        expect(two(dir, ['bogus'])[0]).toBe(2);
    });
});

describe('several roots', () => {
    test('prefix every line with the root name', () => {
        const a = repo({ [SPEC_FILE]: SPEC, 'x.md': 'openspec/specs/demo/spec.md#nope\n' });
        const b = repo({ [SPEC_FILE]: SPEC });
        const res = steward(a, ['check', '--root', `A=${a}`, '--root', `B=${b}`]);
        expect(res.status).toBe(1);
        expect(res.stdout).toMatch(/^A x\.md:1 error dangling-citation/m);
        expect(res.stderr).toMatch(/^A base: none[\s\S]*^B base: none/m);
    });
});
