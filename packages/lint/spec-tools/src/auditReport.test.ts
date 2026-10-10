import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import {
    applyVerdicts,
    CHECKS,
    coverageEntry,
    dedupe,
    exitCodeFor,
    type Finding,
    gitReader,
    grade,
    mergeCoverage,
    partCoverage,
    type PartFindings,
    type PartReaders,
    quoteFound,
    type Reader,
    readerFiles,
    render,
    scopeHeader,
    shortList,
    unitOf,
    unjudged,
    verdict,
} from './auditReport';

/**
 * The report is a function of the workers' JSON and the sources — tested here as such.
 */
const files: Record<string, string[]> = {
    'openspec/specs/<x>/spec.md': ['# x', '', 'The client SHALL   attach the headers', 'it was handed.'],
    'apps/mcp/src/x.ts': ['/** doc */', 'export function attach() {', '    return nothing;', '}'],
};
const read: Reader = (file) => files[file];

const error = (over: Partial<Finding> = {}): Finding => ({
    kind: 'code-mismatch',
    tier: 'ERROR',
    where: '<x>#requirement-a / apps/mcp/src/x.ts:2',
    detail: 'does not attach',
    quotes: [
        { file: 'openspec/specs/<x>/spec.md', line: 3, text: 'The client SHALL attach the headers' },
        { file: 'apps/mcp/src/x.ts', line: 3, text: 'return nothing;' },
    ],
    ...over,
});

describe('quoteFound', () => {
    test('finds a quote at its line with whitespace normalized, one line out, and across lines', () => {
        expect(
            quoteFound({ file: '', line: 3, text: 'SHALL attach the headers' }, files['openspec/specs/<x>/spec.md']),
        ).toBe(true);
        expect(
            quoteFound({ file: '', line: 4, text: 'SHALL attach the headers' }, files['openspec/specs/<x>/spec.md']),
        ).toBe(true);
        expect(
            quoteFound({ file: '', line: 3, text: 'the headers it was handed.' }, files['openspec/specs/<x>/spec.md']),
        ).toBe(true);
    });

    test('rejects a quote that is not there, an empty quote, and a missing file', () => {
        expect(
            quoteFound({ file: '', line: 3, text: 'SHALL drop the headers' }, files['openspec/specs/<x>/spec.md']),
        ).toBe(false);
        expect(quoteFound({ file: '', line: 1, text: 'SHALL attach' }, files['openspec/specs/<x>/spec.md'])).toBe(
            false,
        );
        expect(quoteFound({ file: '', line: 3, text: '   ' }, files['openspec/specs/<x>/spec.md'])).toBe(false);
        expect(quoteFound({ file: '', line: 3, text: 'x' }, undefined)).toBe(false);
    });

    test('reads the audited commit, so an edit of the working tree cannot make a quote appear', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-tools-report-'));
        const run = (...args: string[]) =>
            execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir });
        fs.writeFileSync(path.join(dir, 'x.ts'), 'return nothing;\n');
        run('init', '-q');
        run('add', '.');
        run('commit', '-q', '-m', 'audited');
        fs.writeFileSync(path.join(dir, 'x.ts'), 'return everything;\n');
        const lines = gitReader('HEAD', dir)('x.ts');
        expect(quoteFound({ file: 'x.ts', line: 1, text: 'return everything;' }, lines)).toBe(false);
        expect(quoteFound({ file: 'x.ts', line: 1, text: 'return nothing;' }, lines)).toBe(true);
        expect(gitReader('HEAD', dir)('absent.ts')).toBeUndefined();
        // An ERROR quoting the working tree's edit is lowered to WARN; one quoting the commit stands.
        const committed: Reader = (file) => (file === 'x.ts' ? gitReader('HEAD', dir)(file) : read(file));
        const quoting = (text: string) => error({ quotes: [error().quotes![0]!, { file: 'x.ts', line: 1, text }] });
        expect(grade(quoting('return everything;'), 1, committed)).toMatchObject({
            tier: 'WARN',
            regraded: expect.stringContaining('`x.ts:1`'),
        });
        expect(grade(quoting('return nothing;'), 1, committed).tier).toBe('ERROR');
    }, 60_000); // git in a throwaway repository can take seconds per command on a busy machine
});

describe('grade', () => {
    test('keeps an ERROR whose two quotes are found', () => {
        expect(grade(error(), 1, read)).toMatchObject({ tier: 'ERROR', part: 1 });
    });

    test('re-grades an ERROR to WARN when a quote is not found, or fewer than two are given', () => {
        const wrong = error({
            quotes: [error().quotes![0]!, { file: 'apps/mcp/src/x.ts', line: 3, text: 'return everything;' }],
        });
        expect(grade(wrong, 2, read)).toMatchObject({
            tier: 'WARN',
            regraded: expect.stringContaining('apps/mcp/src/x.ts:3'),
        });
        expect(grade(error({ quotes: [error().quotes![0]!] }), 2, read)).toMatchObject({ tier: 'WARN' });
        const generated = error({
            quotes: [error().quotes![0]!, { file: 'audit-parts/web/state.md', line: 1, text: 'None of them occurs' }],
        });
        expect(
            grade(generated, 2, (f) => (f.startsWith('audit-parts/') ? ['None of them occurs'] : read(f))),
        ).toMatchObject({
            tier: 'WARN',
            regraded: expect.stringContaining('from the sources'),
        });
    });

    test('tiers by the contract: INFO-class kinds are INFO, ERROR-class kinds are WARN at least, unknown kinds are INFO', () => {
        expect(grade(error({ kind: 'untested' }), 1, read)).toMatchObject({
            tier: 'INFO',
            regraded: 'untested is INFO-class',
        });
        expect(grade(error({ kind: 'spec-dup' }), 1, read)).toMatchObject({ tier: 'INFO' });
        expect(grade(error({ tier: 'INFO' }), 1, read)).toMatchObject({ tier: 'WARN' });
        // The kinds the contract deleted are no longer graded as theirs: unknown, so INFO.
        for (const kind of ['vibes', 'mis-citation', 'bad-citation', 'uncited', 'stranded-rule'])
            expect(grade(error({ kind }), 1, read)).toMatchObject({
                tier: 'INFO',
                regraded: expect.stringContaining(kind),
            });
    });

    test('caps a finding against an advisory requirement at WARN, however well proved, and the build proceeds', () => {
        const advisory = new Set(['<x>#requirement-a']);
        const capped = grade(error(), 1, read, advisory);
        expect(capped).toMatchObject({ tier: 'WARN', regraded: expect.stringContaining('Advisory') });
        // The verifier would have confirmed it; the cap stands, and nothing fails.
        const [after] = applyVerdicts(
            [capped],
            new Map([[1, { verdict: 'confirmed', reason: 'real and critical' }]]),
            true,
        );
        expect(after!.tier).toBe('WARN');
        expect(verdict([after!], mergeCoverage(new Map([[1, [part(1)]]]))).state).toBe('PASS');
        // A required requirement's demonstrated defect stays ERROR.
        expect(grade(error({ where: '<x>#requirement-b / apps/mcp/src/x.ts:2' }), 1, read, advisory).tier).toBe(
            'ERROR',
        );
    });
});

const part = (n: number, over: Partial<PartFindings> = {}): PartFindings => ({
    part: n,
    capabilities: [`cap-${n}`],
    findings: [],
    coverage: Object.fromEntries(['1', '2', '3', '4', '5'].map((c) => [c, 'full'])),
    ...over,
});

describe('coverageEntry', () => {
    test('reads the status and the note from one string, and treats anything else as not run', () => {
        expect(coverageEntry('full')).toEqual({ status: 'full', note: undefined });
        expect(coverageEntry('sampled: two windows unopened')).toEqual({
            status: 'sampled',
            note: 'two windows unopened',
        });
        expect(coverageEntry('not-run — no evidence file')).toEqual({ status: 'not-run', note: 'no evidence file' });
        expect(coverageEntry({ status: 'full' })).toMatchObject({ status: 'not-run' });
        expect(coverageEntry(undefined)).toEqual({ status: 'not-run', note: undefined });
    });
});

describe('mergeCoverage and verdict', () => {
    test('is the weakest part, and a missing part runs nothing', () => {
        const parts = new Map<number, PartReaders>([
            [1, [part(1)]],
            [2, [part(2, { coverage: { ...part(2).coverage, '5': 'sampled: long file' } })]],
            [3, [undefined]],
        ]);
        const merged = mergeCoverage(parts);
        expect(merged['5']).toMatchObject({ status: 'not-run', parts: [2, 3] });
        expect(merged['5']!.notes).toEqual(['part 2: long file', 'part 3: no findings file']);
        expect(merged['1']).toMatchObject({ status: 'not-run', parts: [3] });
        expect(Object.keys(merged)).toEqual(['1', '2', '3', '4', '5']);
        expect(verdict([], merged).line).toBe('INCOMPLETE (0 errors, 0 warnings)');
    });

    test('bounds every check by the judged list: a requirement no reader listed was not judged', () => {
        const reader = part(1, { judged: ['a#requirement-x', 'a#requirement-y'] });
        expect(unjudged([reader], ['a#requirement-x', 'a#requirement-y', 'a#requirement-z'])).toEqual([
            'a#requirement-z',
        ]);
        expect(unjudged([part(1)], ['a#requirement-x'])).toEqual(['a#requirement-x']);
        const merged = mergeCoverage(
            new Map([[1, [reader]]]),
            new Map([[1, ['a#requirement-x', 'a#requirement-y', 'a#requirement-z']]]),
        );
        expect(merged['5']).toMatchObject({ status: 'sampled', parts: [1] });
        expect(merged['5']!.notes[0]).toContain('not judged: `a#requirement-z`');
        // the same judged list bounds the specification checks
        expect(merged['3']).toMatchObject({ status: 'sampled' });
        expect(mergeCoverage(new Map([[1, [reader]]]), new Map([[1, ['a#requirement-x']]]))['5']).toMatchObject({
            status: 'full',
        });
    });

    test('covers a part when any of its readers did, and only a part with no reader ran nothing', () => {
        const sampled = part(2, { coverage: { ...part(2).coverage, '5': 'sampled: long file' } });
        expect(partCoverage([sampled, part(2)], '5')).toEqual({ status: 'full', note: undefined });
        expect(partCoverage([sampled, undefined], '5')).toEqual({ status: 'sampled', note: 'long file' });
        expect(partCoverage([undefined, undefined], '5')).toEqual({ status: 'not-run', note: 'no findings file' });
    });

    test('counts a defect two readers both found once, keeping the better-proved twin', () => {
        const a = { ...grade(error(), 1, read), reader: 1 };
        const b = { ...grade(error({ where: 'said differently', tier: 'WARN' }), 1, read), reader: 2 };
        const other = { ...grade(error({ kind: 'conflict', quotes: [] }), 1, read), reader: 2 };
        expect(dedupe([b, a, other]).map((f) => [f.kind, f.tier, f.reader])).toEqual([
            ['code-mismatch', 'ERROR', 1],
            ['conflict', 'WARN', 2],
        ]);
    });

    test('fails on an ERROR, passes when everything ran in full', () => {
        const full = mergeCoverage(new Map([[1, [part(1)]]]));
        expect(verdict([grade(error(), 1, read)], full).line).toBe('FAIL (1 errors, 0 warnings)');
        expect(verdict([grade(error({ kind: 'untested' }), 1, read)], full).line).toBe('PASS (0 errors, 0 warnings)');
    });
});

describe('applyVerdicts — the verification pass over the ERRORs', () => {
    const graded = (over: Partial<Finding> = {}) => grade(error(over), 1, read);

    test('keeps a confirmed ERROR with the reason, and lowers an unconfirmed one to WARN with the reason', () => {
        const kept = graded();
        const lowered = graded({ where: '<x>#requirement-b / apps/mcp/src/x.ts:2' });
        const out = applyVerdicts(
            [kept, lowered],
            new Map([
                [
                    1,
                    {
                        verdict: 'confirmed',
                        reason: 'the code returns nothing where the rule says attach',
                    },
                ],
                [
                    2,
                    {
                        verdict: 'warn',
                        reason: 'the requirement is vague on what attaching means',
                    },
                ],
            ]),
            true,
        );
        expect(out.map((f) => [f.tier, f.verified])).toEqual([
            ['ERROR', 'confirmed — the code returns nothing where the rule says attach'],
            ['WARN', 'not confirmed — the requirement is vague on what attaching means'],
        ]);
    });

    test('answers each ERROR with the verdict at its position, however the verifier restated the finding', () => {
        const first = graded();
        const second = graded({ where: '<x>#requirement-b / apps/mcp/src/x.ts:2' });
        const warn = graded({ tier: 'WARN', where: '<x>#requirement-c' });
        const out = applyVerdicts(
            [first, warn, second],
            new Map([[2, { verdict: 'warn', reason: 'not critical' }]]),
            true,
        );
        expect(out.map((f) => f.tier)).toEqual(['ERROR', 'WARN', 'WARN']);
        expect(out[2]!.verified).toBe('not confirmed — not critical');
        expect(out[0]!.verified).toContain('unverified');
    });

    test('lets an ERROR the pass never reached stand on its quotes and says so, and changes nothing when the pass did not run', () => {
        const f = graded();
        expect(applyVerdicts([f], new Map(), true)[0]).toMatchObject({
            tier: 'ERROR',
            verified: expect.stringContaining('unverified'),
        });
        expect(applyVerdicts([f], new Map(), false)[0]).toEqual(f);
        const warn = graded({ tier: 'WARN' });
        expect(applyVerdicts([warn], new Map([[1, { verdict: 'warn', reason: 'x' }]]), true)[0]).toEqual(warn);
    });
});

describe('render and scopeHeader', () => {
    test('puts the verdict first, then one line per ERROR and WARN, INFO only as counts, and no coverage when full', () => {
        const one = part(1, {
            findings: [
                error({ detail: 'The code drops the item. It never calls preflight.' }),
                error({ kind: 'untested' }),
            ],
        });
        const parts = new Map([[1, [one]]]);
        const findings = one.findings.map((f) => grade(f, 1, read));
        const md = render(['SCOPE 1 capabilities'], findings, mergeCoverage(parts), []);
        const lines = md.split('\n');
        expect(lines[0]).toBe('FAIL (1 errors, 0 warnings)');
        expect(lines[2]).toBe('SCOPE 1 capabilities');
        const errors = lines.filter((l) => l.startsWith('- `code-mismatch`'));
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('— The code drops the item.');
        expect(errors[0]).not.toContain('never calls preflight');
        expect(md).toContain('## Info\n\n- `untested`: 1');
        expect(md).not.toContain('Coverage short');
        expect(md).not.toContain('Quotes');
    });

    test('lists only the checks that fell short', () => {
        const parts = new Map([
            [
                1,
                [
                    part(1, {
                        coverage: {
                            '1': 'full',
                            '2': 'full',
                            '3': 'full',
                            '4': 'full',
                            '5': 'sampled: one test unread',
                        },
                    }),
                ],
            ],
        ]);
        const md = render(['SCOPE all'], [], mergeCoverage(parts), []);
        expect(md.split('\n')[0]).toBe('INCOMPLETE (0 errors, 0 warnings)');
        expect(md).toMatch(
            /## Coverage short\n\n- 5\. A rule whose tests satisfy the wording while failing to protect the intent: sampled — parts 1/,
        );
        expect(md).not.toMatch(/^- 1\. /m);
    });

    test('states the whole-corpus scope and its part count', () => {
        expect(
            scopeHeader({ scope: 'affected', base: 'abc123', capabilities: ['a', 'b'], readers: 1, parts: [] }),
        ).toEqual(['SCOPE affected', '', 'The affected set against `abc123` is empty — nothing to judge.']);
        expect(scopeHeader({ scope: 'all', readers: 2, parts: [] })).toEqual([
            'SCOPE all',
            '',
            'Every capability under `openspec/specs/`, in 0 parts.',
        ]);
    });
});

describe('shortList and readerFiles — what the completion pass is handed', () => {
    const reader = (over: Partial<PartFindings> = {}): PartFindings => ({
        part: 1,
        reader: 1,
        capabilities: ['x'],
        findings: [],
        coverage: { '1': 'full', '2': 'full', '3': 'full', '4': 'full', '5': 'full' },
        judged: ['x#a', 'x#b'],
        ...over,
    });
    const expected = new Map<number, readonly string[]>([
        [1, ['x#a', 'x#b']],
        [2, ['y#a']],
        [3, ['z#a']],
    ]);

    test('lists the requirements no judged list names and the checks no reader ran in full, and leaves a covered part out', () => {
        const parts = new Map<number, PartReaders>([
            [1, [reader()]],
            [
                2,
                [
                    reader({
                        part: 2,
                        capabilities: ['y'],
                        judged: [],
                        coverage: {
                            '1': 'full',
                            '2': 'full',
                            '3': 'full',
                            '4': 'full',
                            '5': 'sampled: y#a — test not opened',
                        },
                    }),
                ],
            ],
            [3, [undefined]],
        ]);
        expect(shortList(parts, expected)).toEqual([
            { part: 2, requirementIds: ['y#a'], checks: { '5': 'sampled: y#a — test not opened' } },
            {
                part: 3,
                requirementIds: ['z#a'],
                checks: Object.fromEntries(['1', '2', '3', '4', '5'].map((c) => [c, 'not-run: no findings file'])),
            },
        ]);
    });

    test('is empty once a completion reader covers what the first left, so the pass is a no-op on a covered run', () => {
        const first = reader({
            part: 2,
            capabilities: ['y'],
            judged: [],
            coverage: { '1': 'full', '2': 'full', '3': 'full', '4': 'full', '5': 'sampled: y#a' },
        });
        const completion = reader({
            part: 2,
            reader: 2,
            capabilities: ['y'],
            judged: ['y#a'],
            coverage: { '5': 'full' },
        });
        const parts = new Map<number, PartReaders>([[2, [first, completion]]]);
        expect(shortList(parts, new Map([[2, ['y#a']]]))).toEqual([]);
        expect(mergeCoverage(parts, new Map([[2, ['y#a']]]))['5']!.status).toBe('full');
    });

    test('reads the listed files first, then any further reader file of the same part, never another part', () => {
        const present = [
            'audit-parts/findings/part-1-1.json',
            'audit-parts/findings/part-1-2.json',
            'audit-parts/findings/part-11-2.json',
            'audit-parts/findings/worker-1.jsonl',
        ];
        expect(readerFiles(['audit-parts/findings/part-1-1.json'], present, 1)).toEqual([
            'audit-parts/findings/part-1-1.json',
            'audit-parts/findings/part-1-2.json',
        ]);
        expect(readerFiles(['audit-parts/findings/part-11-1.json'], present, 11)).toEqual([
            'audit-parts/findings/part-11-1.json',
            'audit-parts/findings/part-11-2.json',
        ]);
    });
});

describe('exitCodeFor', () => {
    test('is 0 on PASS, 1 on FAIL and 3 on INCOMPLETE — the allowed failure', () => {
        expect(exitCodeFor('PASS')).toBe(0);
        expect(exitCodeFor('FAIL')).toBe(1);
        expect(exitCodeFor('INCOMPLETE')).toBe(3);
    });
});

describe('unitOf', () => {
    test('names the unit a finding is about by the requirement id its where opens with', () => {
        expect(unitOf('apps/eve#requirement-x / apps/eve/lib/a.ts:12')).toBe('apps/eve#requirement-x');
        expect(unitOf('cap#requirement-a')).toBe('cap#requirement-a');
    });
});

const skills = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../skills');
const skill = (file: string) => fs.readFileSync(path.join(skills, file), 'utf8');

/** spec-verify's checks that are spec-steward criteria: check number, its name, the criterion it is. */
const shared = [
    ...skill('spec-verify/SKILL.md').matchAll(/^(\d)\. \*\*(.+?)\.\*\* \(spec-steward criterion (\d+)\)/gm),
].map(([, check, name, criterion]) => ({ check: check!, name: name!, criterion: criterion! }));

describe('the audits share their criteria', () => {
    test('spec-verify names checks 2–5 by spec-steward criteria 10, 9, 11 and 5', () => {
        expect(shared.map(({ check, criterion }) => [check, criterion])).toEqual([
            ['2', '10'],
            ['3', '9'],
            ['4', '11'],
            ['5', '5'],
        ]);
    });

    test('each shared check is worded exactly as its criterion, in the skill and in the merged report', () => {
        const criteria = skill('spec-steward/references/criteria.md');
        for (const { check, name, criterion } of shared) {
            expect(criteria).toMatch(
                new RegExp(`^${criterion}\\. ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`, 'm'),
            );
            expect(CHECKS[check]).toBe(name);
        }
    });
});
