import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test, vi } from 'vitest';

// Every case drives git; on a loaded machine one process start can take seconds.
vi.setConfig({ testTimeout: 300_000 });
import { align } from './lib/align.mjs';
import { applyFixes } from './lib/checks.mjs';
import { scanCitations } from './lib/citations.mjs';
import { loadCorpus, parseSpec } from './lib/corpus.mjs';
import { coverageReport } from './lib/coverage.mjs';
import { evidenceModel, sourceIndex } from './lib/evidence.mjs';
import { forget } from './lib/git.mjs';
import { lint, parseReview, render, status, verify } from './lib/review.mjs';
import { blockAt, stripComments, testBlocks } from './lib/scan.mjs';
import { globToRegExp, slugify } from './lib/util.mjs';
import { addGuidance, AGENTS_LINE, hookFindings } from './lib/wire.mjs';
import { runCheck } from './steward.mjs';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'steward.mjs');
const dirs = [];

const SPEC = `# demo Specification

## Purpose

Demo.

## Requirements

### Requirement: Orders are confirmed once

The service SHALL confirm an order exactly once and MUST NOT retry a confirmation that timed out.

#### Scenario: A confirmation times out

- **WHEN** the confirmation call to \`confirmOrder\` times out
- **THEN** the order is reported unknown and is not confirmed again

#### Scenario: A confirmation succeeds

- **WHEN** \`confirmOrder\` answers
- **THEN** the order is confirmed

### Requirement: Payloads stay lean

The service SHALL keep payloads lean, as implemented in \`apps/api/src/payload.ts\`.

#### Scenario: Lean payload

- **WHEN** the service keeps payloads lean
- **THEN** payloads are lean
`;
const SPEC_FILE = 'openspec/specs/demo/spec.md';

/** A requirement block to append to SPEC; `extra` goes between its statement and its scenarios. */
const requirement = (name, statement, scenarios, extra = '') =>
    `\n### Requirement: ${name}\n\n${statement}\n${extra}${scenarios
        .map((s) => `\n#### Scenario: ${s}\n\n- **WHEN** ${s.toLowerCase()} happens\n- **THEN** it is handled\n`)
        .join('')}`;
/** 1-based line of the first line containing `needle`. */
const lineOf = (text, needle) => text.split('\n').findIndex((l) => l.includes(needle)) + 1;
const cite = (anchor) => `{@link ${SPEC_FILE}#${anchor}}`;

const ENV = { ...process.env, CI: '', CI_MERGE_REQUEST_DIFF_BASE_SHA: '' };
const GIT_ENV = {
    ...ENV,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
};
const git = (dir, ...args) => spawnSync('git', args, { cwd: dir, env: GIT_ENV, encoding: 'utf8' }).stdout.trim();

const write = (dir, file, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
};

/** A git repository with the given files committed on `main`, which `origin/main` also names. */
function repo(files) {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'steward-')));
    dirs.push(dir);
    for (const [file, text] of Object.entries(files)) write(dir, file, text);
    spawnSync(
        'sh',
        [
            '-c',
            'git init -q -b main && git add -A && git commit -q -m base && git update-ref refs/remotes/origin/main HEAD',
        ],
        { cwd: dir, env: GIT_ENV },
    );
    return dir;
}

const rootOf = (dir) => ({ name: path.basename(dir), path: dir, specsDir: 'openspec/specs' });
/** Findings of one in-process check run, as `spec-steward check` computes them. */
const check = (dir, opts = {}) => {
    const run = runCheck(rootOf(dir), opts);
    return { ...run, of: (kind) => run.findings.filter((f) => f.kind === kind) };
};
const steward = (dir, args, { input, env } = {}) =>
    spawnSync('node', [CLI, ...args], { cwd: dir, input, encoding: 'utf8', env: { ...ENV, ...env } });
const anchorsOf = (text) => parseSpec(text, '', '').slugs;
/** The coverage report's row for a requirement or scenario, by its title. */
const coverageRow = (dir, title) =>
    coverageReport(loadCorpus(dir), scanCitations(dir, anchorsOf))
        .markdown.split('\n')
        .find((l) => l.includes(`[${title}]`));

afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('anchors', () => {
    test('match the rendered heading slugs, repeats included', () => {
        const seen = new Map();
        expect(slugify("Requirement: A changed requirement's evidence — assembled")).toBe(
            'requirement-a-changed-requirements-evidence--assembled',
        );
        expect([slugify('Scenario: x', seen), slugify('Scenario: x', seen), slugify('Scenario: x', seen)]).toEqual([
            'scenario-x',
            'scenario-x-1',
            'scenario-x-2',
        ]);
    });

    test('a heading that renders an earlier slug again is a duplicate-anchor error', () => {
        const spec = `${SPEC}${requirement('Refunds are idempotent', 'A refund SHALL apply once.', ['A confirmation succeeds'])}`;
        const dir = repo({ [SPEC_FILE]: spec });
        expect(check(dir).of('duplicate-anchor')).toEqual([
            expect.objectContaining({
                severity: 'error',
                line: spec.split('\n').lastIndexOf('#### Scenario: A confirmation succeeds') + 1,
                message: expect.stringContaining('#scenario-a-confirmation-succeeds'),
            }),
        ]);
    });
});

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
        expect(r.strong + r.weak).toBe(5);
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
        const sizes = (opts) =>
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

describe('the scenario ratchet', () => {
    const added = requirement('Refunds are idempotent', 'A refund SHALL be applied at most once per request id.', [
        'A repeat',
        'A first refund',
    ]);
    const ratchet = (dir, opts = {}) => check(dir, { base: 'main', ...opts }).of('scenario-unproven');

    test('fails a new or modified scenario of a REQUIRED requirement that nothing binds, at file:line', () => {
        const dir = repo({ [SPEC_FILE]: SPEC });
        write(dir, SPEC_FILE, `${SPEC}${added}`);
        expect(ratchet(dir).map((f) => [f.severity, f.file, f.line, f.message.slice(0, 22)])).toEqual([
            ['error', SPEC_FILE, lineOf(`${SPEC}${added}`, 'Scenario: A repeat'), 'scenario "A repeat" is'],
            ['error', SPEC_FILE, lineOf(`${SPEC}${added}`, 'Scenario: A first'), 'scenario "A first refu'],
        ]);

        const edited = SPEC.replace('the order is confirmed\n', 'the order is confirmed and logged\n');
        write(dir, SPEC_FILE, edited);
        expect(ratchet(dir).map((f) => [f.severity, f.line])).toEqual([
            ['error', lineOf(edited, 'Scenario: A confirmation succeeds')],
        ]);
    });

    test('a test block, its attached comment, a type assertion, a lint entry or a --binds file binds; a header does not', () => {
        const dir = repo({ [SPEC_FILE]: SPEC });
        write(dir, SPEC_FILE, `${SPEC}${added}`);
        write(dir, 'apps/a.test.ts', `// ${cite('scenario-a-repeat')}\nimport x from 'x';\n\ntest('t', () => {});\n`);
        const header = check(dir, { base: 'main' });
        expect(header.of('scenario-unproven')).toHaveLength(2);
        expect(header.findings.filter((f) => f.file === 'apps/a.test.ts')).toEqual([]);

        write(dir, 'apps/a.test.ts', `// ${cite('scenario-a-repeat')}\nit('t', () => {});\n`);
        write(dir, 'apps/b.test-d.ts', `// ${cite('scenario-a-first-refund')}\ntype _x = Expect<Equal<1, 1>>;\n`);
        expect(ratchet(dir)).toEqual([]);

        fs.rmSync(path.join(dir, 'apps/b.test-d.ts'));
        write(dir, 'eslint.config.mjs', `export default [\n    // ${cite('scenario-a-first-refund')}\n    {},\n];\n`);
        expect(ratchet(dir)).toEqual([]);

        fs.rmSync(path.join(dir, 'eslint.config.mjs'));
        write(dir, 'yarn.config.cjs', `// ${cite('scenario-a-first-refund')}\nmodule.exports = {};\n`);
        expect(ratchet(dir)).toEqual([]);

        fs.rmSync(path.join(dir, 'yarn.config.cjs'));
        write(dir, 'scripts/checks/refunds.sh', `# ${cite('scenario-a-first-refund')}\ntest -f x\n`);
        expect(ratchet(dir)).toHaveLength(1);
        expect(ratchet(dir, { binds: ['scripts/checks/**'] })).toEqual([]);
        // The repository's own binds, declared once in its package.json.
        write(dir, 'package.json', JSON.stringify({ 'spec-steward': { binds: ['scripts/checks/**'] } }));
        expect(ratchet(dir)).toEqual([]);
    });

    test("a requirement's anchor binds only its one scenario", () => {
        const one = requirement('Refunds are idempotent', 'A refund SHALL be applied once.', ['A repeat']);
        const dir = repo({ [SPEC_FILE]: SPEC });
        write(dir, SPEC_FILE, `${SPEC}${one}`);
        write(dir, 'apps/a.test.ts', `// ${cite('requirement-refunds-are-idempotent')}\ntest('t', () => {});\n`);
        expect(ratchet(dir)).toEqual([]);
        write(dir, SPEC_FILE, `${SPEC}${added}`);
        expect(ratchet(dir)).toHaveLength(2);
    });

    test('a Known gap exempts the scenarios it names by title; nothing else does', () => {
        const dir = repo({ [SPEC_FILE]: SPEC });
        const gap = (text) =>
            `${SPEC}${requirement('Refunds are idempotent', 'A refund SHALL be applied at most once per request id.', ['A repeat', 'A first refund'], `\n${text}\n`)}`;
        let spec = gap("**⚠️ Known gap (PROJ-1):** exempts scenario 'A repeat': no store yet.");
        write(dir, SPEC_FILE, spec);
        expect(ratchet(dir).map((f) => f.line)).toEqual([lineOf(spec, 'Scenario: A first')]);

        write(dir, SPEC_FILE, gap('**⚠️ Known gap (PROJ-1):** no store yet.'));
        expect(ratchet(dir)).toHaveLength(2);
        expect(coverageRow(dir, 'Refunds are idempotent')).toMatch(/\| known gap \(PROJ-1\) \|$/);
        expect([coverageRow(dir, 'A repeat'), coverageRow(dir, 'A first refund')]).toEqual([
            expect.stringMatching(/\| no test \|$/),
            expect.stringMatching(/\| no test \|$/),
        ]);
        expect(coverageReport(loadCorpus(dir), scanCitations(dir, anchorsOf)).markdown).toMatch(
            /## Known gaps\n\n\| Tracker \| Requirement \| Gap \|\n\| --- \| --- \| --- \|\n\| PROJ-1 \| \[demo#requirement-refunds-are-idempotent\]/,
        );

        // Inside a scenario's block a Known gap exempts nothing, and is reported.
        spec = `${SPEC}${added}\n**⚠️ Known gap (openspec/changes/refunds):** not built.\n`;
        write(dir, SPEC_FILE, spec);
        expect(ratchet(dir)).toHaveLength(2);
        expect(check(dir, { base: 'main' }).of('marker-hygiene')[0].message).toContain(
            'inside a scenario it grants nothing',
        );

        write(dir, SPEC_FILE, gap('**⚠️ Known gap:** exempts scenario _A repeat_.'));
        const run = check(dir, { base: 'main' });
        expect(run.of('scenario-unproven')).toHaveLength(2);
        expect(run.of('marker-hygiene')[0].message).toContain('names its tracker');

        write(dir, SPEC_FILE, gap("**⚠️ Unenforced:** exempts scenario 'A repeat'."));
        expect(ratchet(dir)).toHaveLength(2);
    });

    test('an advisory requirement, an unchanged scenario and a verbatim move ask nothing; coverage lists the unbound', () => {
        const dir = repo({ [SPEC_FILE]: `${SPEC}${added}` });
        write(dir, SPEC_FILE, `${SPEC}${added.replace('A refund SHALL', 'Refunds: a refund SHALL')}`);
        expect(ratchet(dir)).toEqual([]);
        expect(coverageRow(dir, 'A repeat')).toMatch(/\| no test \|$/);

        write(dir, SPEC_FILE, SPEC);
        write(dir, 'openspec/specs/refunds/spec.md', `# refunds\n\n## Purpose\n\nR.\n\n## Requirements\n${added}`);
        expect(ratchet(dir)).toEqual([]);

        fs.rmSync(path.join(dir, 'openspec/specs/refunds'), { recursive: true });
        const repeat = '\n#### Scenario: A repeat\n\n- **WHEN** a repeat happens\n- **THEN** it is handled\n';
        write(dir, SPEC_FILE, `${SPEC}${repeat}${added.replace(repeat, '')}`);
        expect(ratchet(dir)).toEqual([]);

        write(dir, SPEC_FILE, `${SPEC}${added.replace('A repeat\n', 'A second repeat\n')}`);
        expect(ratchet(dir)).toHaveLength(1);
        write(
            dir,
            SPEC_FILE,
            `${SPEC}${added.replace('A refund SHALL', '**⚠️ Advisory:** conduct.\n\nA refund SHALL').replace('A repeat\n', 'A second repeat\n')}`,
        );
        expect(ratchet(dir)).toEqual([]);
    });
});

describe('--base', () => {
    test('auto takes the merge request diff base in CI, nothing in another CI pipeline, the merge base locally', () => {
        const dir = repo({ [SPEC_FILE]: SPEC });
        const sha = git(dir, 'rev-parse', 'HEAD');
        write(dir, SPEC_FILE, SPEC.replace('MUST NOT retry', 'SHOULD NOT retry'));
        const run = (env) => {
            const res = steward(dir, ['check', '--json', '--base', 'auto'], { env });
            return { stderr: res.stderr, findings: JSON.parse(res.stdout) };
        };

        const mr = run({ CI: 'true', CI_MERGE_REQUEST_DIFF_BASE_SHA: sha });
        expect(mr.stderr).toContain(`base: ${sha} (the merge request diff base)`);
        expect(mr.findings.filter((f) => f.kind === 'weakened')).toHaveLength(1);

        const pipeline = run({ CI: 'true' });
        expect(pipeline.stderr).toMatch(
            /base: none — a CI pipeline outside a merge request\n {2}skipped: weakened, new-requirement, renamed-anchor, scenario-unproven, non-ears, non-bdd; prompts not printed/,
        );
        expect(pipeline.findings.filter((f) => f.severity === 'info' || f.kind === 'weakened')).toEqual([]);

        const local = run({});
        expect(local.stderr).toContain(`base: ${sha} (merge base of origin/main)`);
        expect(local.findings.filter((f) => f.kind === 'weakened')).toHaveLength(1);
    });

    test('under a base, prompts cover only what the diff added or edited, and citations in changed files', () => {
        const dir = repo({
            [SPEC_FILE]: SPEC,
            'apps/old.test.ts': `// ${cite('requirement-orders-are-confirmed-once')}\ntest('t', () => {});\n`,
        });
        write(dir, SPEC_FILE, SPEC.replace('keep payloads lean', 'keep payloads appropriately lean'));
        const prompts = check(dir, { base: 'main' }).findings.filter((f) => f.severity === 'info');
        expect(new Set(prompts.map((f) => f.id))).toEqual(new Set(['demo#requirement-payloads-stay-lean']));
        expect(prompts.map((f) => f.kind)).toEqual(expect.arrayContaining(['vague-obligation', 'impl-detail']));
        expect(check(dir).of('unbound-test')).toHaveLength(1);
        expect(check(dir, { base: 'main' }).of('unbound-test')).toEqual([]);

        write(dir, 'apps/old.test.ts', `// ${cite('requirement-orders-are-confirmed-once')}\ntest('u', () => {});\n`);
        expect(check(dir, { base: 'main' }).of('unbound-test')).toHaveLength(1);
    });

    test('non-ears and non-bdd judge new text only, and never fail', () => {
        const dir = repo({ [SPEC_FILE]: SPEC });
        write(
            dir,
            SPEC_FILE,
            `${SPEC}\n### Requirement: Refunds\n\nRefunds MUST be idempotent.\n\n#### Scenario: Repeat\n\n- **THEN** nothing\n\n### Requirement: Credits\n\nWhen a credit arrives, the ledger SHALL book it.\n\n#### Scenario: Book\n\n- **GIVEN** a ledger\n- **WHEN** a credit arrives\n- **THEN** it is booked\n`,
        );
        const run = check(dir, { base: 'main' });
        expect(run.of('non-ears').map((f) => [f.id, f.severity])).toEqual([['demo#requirement-refunds', 'info']]);
        expect(run.of('non-ears')[0].message).toContain('When <trigger>, the <system> SHALL <response>');
        expect(run.of('non-bdd').map((f) => f.message)).toEqual([expect.stringContaining('"Repeat" lacks WHEN/THEN')]);
    });
});

describe('markers', () => {
    const marked = (line) => SPEC.replace('The service SHALL keep', `${line}\n\nThe service SHALL keep`);

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
        const absolute = (statement, extra = '') => `${SPEC}${requirement('Absolute', statement, ['One'], extra)}`;
        const prompts = (spec, files = {}) =>
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
        const two = (cwd, args, env) => {
            const res = steward(cwd, args, { env });
            const lines = res.stderr.split('\n').filter((l) => l.startsWith('spec-steward: '));
            return [res.status, lines.pop() ?? res.stderr];
        };
        expect(two(dir, ['check', '--marker', 'x'])).toEqual([2, 'spec-steward: check: unknown flag --marker']);
        expect(two(dir, ['check', '--base', 'nope'])).toEqual([
            2,
            'spec-steward: base ref nope not found — git fetch origin',
        ]);
        expect(
            two(dir, ['check', '--base', 'auto'], { CI: 'true', CI_MERGE_REQUEST_DIFF_BASE_SHA: 'f'.repeat(40) }),
        ).toEqual([2, `spec-steward: CI_MERGE_REQUEST_DIFF_BASE_SHA ${'f'.repeat(40)} is not in this clone`]);
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

describe('coverage', () => {
    test('statuses come from bindings and markers only, and the Markdown is MDX-safe', () => {
        const dir = repo({
            [SPEC_FILE]: `${SPEC.replace('The service SHALL keep', '**⚠️ Advisory:** a {judgement} <x>.\n\nThe service SHALL keep')}${requirement(
                'Refunds are idempotent',
                'A refund SHALL apply once.',
                ['A repeat', 'A first refund'],
                "\n**⚠️ Known gap (PROJ-9):** exempts scenario 'A repeat': no store | yet.\n**⚠️ Unenforced:** old.\n",
            )}`,
            'apps/a.test.ts': `// ${cite('scenario-a-confirmation-times-out')}\ntest('t', () => {});\n`,
            'apps/a.ts': `// ${cite('scenario-a-confirmation-succeeds')}\n`,
        });
        const { markdown: md, totals } = coverageReport(loadCorpus(dir), scanCitations(dir, anchorsOf));
        expect(totals).toMatchObject({ requirements: 3, advisory: 1, gaps: 1, unboundRequirements: 1, retired: 1 });
        expect(md).toContain(
            '3 requirements across 1 capabilities. **1** advisory; **1** known gaps; **1** REQUIRED requirements bound by no test; **3** REQUIRED scenarios bound by no test; **1** retired markers.',
        );
        const row = (label) => md.split('\n').find((l) => l.includes(`[${label}]`));
        expect(row('Orders are confirmed once')).toMatch(/\| tested \|$/);
        expect(row('A confirmation times out')).toMatch(/`apps\/a\.test\.ts:1` \| — \| bound \|$/);
        expect(row('A confirmation succeeds')).toMatch(/\| — \| `apps\/a\.ts:1` \| no test \|$/);
        expect(row('Payloads stay lean')).toMatch(/\| advisory \|$/);
        expect(row('Lean payload')).toMatch(/\| — \| — \| — \|$/);
        expect(row('Refunds are idempotent')).toMatch(/\| known gap \(PROJ-9\) \|$/);
        expect(row('A repeat')).toMatch(/\| known gap \(PROJ-9\) \|$/);
        expect(row('A first refund')).toMatch(/\| no test \|$/);
        expect(md).toContain("exempts scenario 'A repeat': no store \\| yet.");
        expect(md).toMatch(
            /## Retired markers\n\n- `openspec\/specs\/demo\/spec\.md:\d+` \*\*⚠️ Unenforced:\*\* old\./,
        );
        expect(md).not.toMatch(/\{judgement\}|<x>/);

        const res = steward(dir, ['coverage', '--out', 'cov.md']);
        expect([res.status, fs.readFileSync(path.join(dir, 'cov.md'), 'utf8')]).toEqual([0, md]);
    });
});

describe('evidence --json', () => {
    test('bound tests, pointers, term hits in comment-stripped sources, gaps and class for every requirement', () => {
        const dir = repo({
            [SPEC_FILE]: SPEC.replace('The service SHALL keep', '**⚠️ Advisory:** taste.\n\nThe service SHALL keep'),
            'apps/order.ts': `// confirmOrder in a comment\nexport const confirmOrder = () => 1;\n// ${cite('requirement-orders-are-confirmed-once')}\n`,
            'apps/order.test.ts': `// ${cite('scenario-a-confirmation-succeeds')}\ntest('answers', () => confirmOrder());\n`,
        });
        const res = steward(dir, ['evidence', '--json']);
        expect(res.status).toBe(0);
        const model = JSON.parse(res.stdout);
        forget();
        expect(model).toEqual(evidenceModel(loadCorpus(dir), scanCitations(dir, anchorsOf), sourceIndex(dir)));
        expect(model).toMatchObject({ version: 1, root: path.basename(dir) });
        const [orders, payloads] = model.requirements;
        expect(Object.keys(orders)).toEqual([
            'id',
            'capability',
            'file',
            'line',
            'end',
            'block',
            'class',
            'gaps',
            'scenarios',
            'bindings',
            'pointers',
            'terms',
            'related',
        ]);
        expect(orders).toMatchObject({
            id: 'demo#requirement-orders-are-confirmed-once',
            capability: 'demo',
            file: SPEC_FILE,
            class: 'required',
            gaps: [],
            bindings: [
                {
                    file: 'apps/order.test.ts',
                    line: 1,
                    anchor: 'scenario-a-confirmation-succeeds',
                    kind: 'test',
                    title: 'answers',
                    window: [1, 2],
                },
            ],
            pointers: [
                { file: 'apps/order.ts', line: 3, anchor: 'requirement-orders-are-confirmed-once', kind: 'code' },
            ],
            terms: [{ term: 'confirmOrder', hits: [{ file: 'apps/order.ts', line: 2 }] }],
        });
        expect(orders.scenarios.map((s) => [s.slug, s.bound])).toEqual([
            ['scenario-a-confirmation-times-out', false],
            ['scenario-a-confirmation-succeeds', true],
        ]);
        expect(payloads.class).toBe('advisory');
    });
});

describe('hook', () => {
    test('feeds back what an edit weakened, once, and ignores unrelated files', () => {
        const dir = repo({ [SPEC_FILE]: SPEC, 'README.md': '# x\n' });
        write(dir, SPEC_FILE, SPEC.replace('MUST NOT retry', 'SHOULD NOT retry'));
        const hook = (file) =>
            steward(dir, ['hook'], {
                input: JSON.stringify({ tool_name: 'Edit', cwd: dir, tool_input: { file_path: path.join(dir, file) } }),
            });
        const first = hook(SPEC_FILE);
        expect(JSON.parse(first.stdout)).toMatchObject({ decision: 'block' });
        expect(JSON.parse(first.stdout).reason).toContain('weakened');
        expect(hook(SPEC_FILE).stdout).toBe('');
        expect(hook('README.md').stdout).toBe('');
    });

    test('asks a new requirement for its failure and evidence, says nothing of untouched ones, runs no ratchet', () => {
        const dir = repo({ [SPEC_FILE]: SPEC });
        write(
            dir,
            SPEC_FILE,
            `${SPEC}\n### Requirement: Refunds are idempotent\n\nA refund SHALL be applied at most once per request id.\n\n#### Scenario: Repeat\n\n- **WHEN** a refund request repeats its id\n- **THEN** no second refund is made\n`,
        );
        const kinds = hookFindings(dir, SPEC_FILE).map((f) => `${f.kind} ${f.id ?? ''}`);
        expect(kinds).toContain('new-requirement demo#requirement-refunds-are-idempotent');
        expect(kinds.join()).not.toContain('payloads-stay-lean');
        expect(kinds.join()).not.toContain('scenario-unproven');
    });

    test('reports size and a duplicate anchor in the edited spec', () => {
        const dir = repo({ [SPEC_FILE]: SPEC });
        write(
            dir,
            SPEC_FILE,
            `${SPEC}${requirement('Many', 'It MUST a, MUST b, MUST c, MUST d, MUST e, MUST f, MUST g, MUST h, MUST i.', ['Lean payload'])}`,
        );
        const found = hookFindings(dir, SPEC_FILE).map((f) => `${f.severity} ${f.kind}: ${f.message.split(' — ')[0]}`);
        expect(found).toEqual(
            expect.arrayContaining([
                'error size: 9 obligations in the statement (> 8)',
                expect.stringMatching(/^error duplicate-anchor: renders #scenario-lean-payload/),
            ]),
        );
    });
});

describe('wire', () => {
    test('reports the missing points, fixes the mechanical ones, and passes once routed', () => {
        const dir = repo({
            [SPEC_FILE]: SPEC,
            'openspec/config.yaml':
                "schema: spec-driven\n\n# keep me\noperations:\n  apply:\n    guidance:\n      - 'existing'\n",
            'AGENTS.md': '# Agents\n',
        });
        expect(steward(dir, ['wire', '--check']).status).toBe(1);
        const fixed = steward(dir, ['wire', '--fix']);
        expect(fixed.stdout).toContain(
            `add to AGENTS.md, beside the specification-driven convention:\n  ${AGENTS_LINE}`,
        );
        expect(AGENTS_LINE).toMatch(
            /corpus-quality audits.*`spec-steward` skill.*code conformance is the `spec-verify` audit/,
        );
        const config = fs.readFileSync(path.join(dir, 'openspec/config.yaml'), 'utf8');
        expect(config).toContain('# keep me');
        expect(config).toContain("- 'existing'");
        expect(config.match(/spec gate \(AGENTS\.md → Checks\)/g)).toHaveLength(2);
        expect(
            JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8')).hooks.PostToolUse[0].hooks[0]
                .command,
        ).toContain('node_modules/.bin/spec-steward"; [ ! -x "$f" ] || "$f" hook');

        write(dir, 'AGENTS.md', '# Agents\n\nSpecs are guarded by spec-steward.\n');
        write(dir, '.agents/rules/openspec.md', '-');
        write(dir, '.claude/skills/spec-steward/SKILL.md', '-');
        expect(steward(dir, ['wire', '--check']).status).toBe(0);
    });

    test('replaces guidance an earlier version wrote with the pointer to the spec gate', () => {
        const legacy =
            "operations:\n  apply:\n    guidance:\n      - 'run `node x/steward.mjs check --base <b>`'\n  archive:\n    guidance:\n      - 'keep'\n";
        expect(addGuidance(legacy, 'apply', 'pointer')).toBe(
            legacy.replace("'run `node x/steward.mjs check --base <b>`'", "'pointer'"),
        );
    });

    test('adds guidance to a config without operations', () => {
        expect(addGuidance('schema: spec-driven\n', 'archive', "it's")).toBe(
            "schema: spec-driven\n\noperations:\n  archive:\n    guidance:\n      - 'it''s'\n",
        );
    });
});

describe('review', () => {
    const finding = (over) => ({
        repo: 'X',
        file: SPEC_FILE,
        line: 11,
        quote: 'The service SHALL confirm an order exactly once … timed out.',
        layer: 'SPEC-REQUIRED',
        criteria: [5],
        whatsWrong: 'w',
        proposed: 'Keep → OpenSpec REQUIRED invariant',
        area: 'demo',
        ...over,
    });

    test('renders items whose quotes are found, and counts the owner’s answers', () => {
        const dir = repo({ [SPEC_FILE]: SPEC });
        const { markdown } = render({
            findings: [finding({})],
            themes: [
                {
                    title: 'Restating scenarios',
                    whatsWrong: 'w',
                    proposed: 'Delete → noise',
                    layer: 'DELETE',
                    criteria: [19],
                    members: [finding({ line: 27, quote: 'Scenario: Lean payload', area: 'demo' })],
                },
            ],
        });
        let items = parseReview(markdown);
        expect(lint(markdown, items)).toEqual([]);
        expect(verify(items, new Map([['X', dir]]))).toEqual([]);
        expect(verify(parseReview(markdown.replace('exactly once', 'twice')), new Map([['X', dir]]))[0]).toContain(
            'quote not found',
        );

        const answered = markdown
            .replace('My response: ⬜', 'My response: ✅')
            .replace('My response: ⬜', 'My response: why not merge it?');
        items = parseReview(answered);
        const s = status(items);
        expect(s.counts).toMatchObject({ accepted: 1, comment: 1 });
        expect(s.acceptedNotApplied).toHaveLength(1);
        expect(
            status(parseReview(answered.replace('My response: ✅', 'My response: ✅\n   * Applied: R1 — done')))
                .acceptedNotApplied,
        ).toEqual([]);
    });
});

describe('align', () => {
    test('pairs shared capabilities and reports drift and one-sided rules', () => {
        const a = repo({ [SPEC_FILE]: SPEC });
        const b = repo({
            'openspec/specs/platform/demo/spec.md': SPEC.replace('exactly once', 'once').replace(
                /### Requirement: Payloads[\s\S]*$/,
                '',
            ),
        });
        const [pair] = align(loadCorpus(a), loadCorpus(b));
        expect(pair.requirements.map((r) => r.kind)).toEqual(['drift', 'only-a']);
        expect(pair.requirements[0].onlyA).toContain('exactly');
    });

    test('a scenario only one repository has is not drift: a shared rule is its name and statement', () => {
        const a = repo({ [SPEC_FILE]: SPEC });
        const b = repo({
            [SPEC_FILE]: SPEC.replace(
                '- **THEN** the order is confirmed\n',
                '- **THEN** the order is confirmed\n\n#### Scenario: A repository-only case\n\n- **WHEN** an order is replayed\n- **THEN** it is confirmed once\n',
            ),
        });
        const [pair] = align(loadCorpus(a), loadCorpus(b));
        expect(pair.requirements.map((r) => r.kind)).toEqual(['identical', 'identical']);
    });
});
