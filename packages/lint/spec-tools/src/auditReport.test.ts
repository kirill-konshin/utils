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
    type Graded,
    mergeCoverage,
    partCoverage,
    type PartFindings,
    type PartReaders,
    quoteFound,
    type Reader,
    readerClaims,
    readerFiles,
    render,
    scopeHeader,
    shortList,
    unitOf,
    unjudged,
    verdict,
} from './auditReport';
import { checkData, READER_FINDINGS, toYaml } from './data';
import { THRESHOLDS } from './severity';

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
    readerSeverity: 80,
    where: '<x>#requirement-a / apps/mcp/src/x.ts:2',
    detail: 'does not attach',
    readerConfidence: 80,
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
    test('keeps an ERROR-band finding whose two quotes are found, at its severity and confidence', () => {
        expect(grade(error(), 1, read)).toMatchObject({ tier: 'ERROR', part: 1, severity: 80, confidence: 80 });
        expect(grade(error(), 1, read).cap).toBeUndefined();
    });

    test('caps an ERROR-band finding below the band when a quote is not found, or fewer than two are given', () => {
        const wrong = error({
            quotes: [error().quotes![0]!, { file: 'apps/mcp/src/x.ts', line: 3, text: 'return everything;' }],
        });
        expect(grade(wrong, 2, read)).toMatchObject({
            tier: 'WARN',
            severity: 69,
            regraded: expect.stringContaining('apps/mcp/src/x.ts:3'),
        });
        expect(grade(error({ quotes: [error().quotes![0]!] }), 2, read)).toMatchObject({ tier: 'WARN' });
        const generated = error({
            quotes: [
                error().quotes![0]!,
                { file: '.spec-audit/parts/web/state.yaml', line: 1, text: 'None of them occurs' },
            ],
        });
        expect(
            grade(generated, 2, (f) => (f.startsWith('.spec-audit/') ? ['None of them occurs'] : read(f))),
        ).toMatchObject({
            tier: 'WARN',
            regraded: expect.stringContaining('from the sources'),
        });
        // Installed dependency code is not ours: its quote proves nothing, and is never looked up — the commit does not
        // carry it, so a run in CI and a run on the working tree grade the finding alike.
        const dependency = { file: 'node_modules/@x/sdk/dist/log.js', line: 21, text: 'return value;' };
        expect(grade(error({ quotes: [error().quotes![0]!, dependency] }), 2, read)).toMatchObject({
            tier: 'WARN',
            regraded: expect.stringContaining('from the sources'),
        });
        expect(grade(error({ quotes: [...error().quotes!, dependency] }), 2, read).tier).toBe('ERROR');
    });

    test('caps by the contract: INFO-class kinds below WARN, a conflict below ERROR, unknown kinds below WARN, and never raises', () => {
        expect(grade(error({ kind: 'untested' }), 1, read)).toMatchObject({
            tier: 'INFO',
            severity: 39,
            regraded: 'untested is INFO-class',
        });
        expect(grade(error({ kind: 'spec-dup' }), 1, read)).toMatchObject({ tier: 'INFO' });
        // A cap lowers, and never raises: the reader's lower severity stands, with no reason given.
        for (const [readerSeverity, tier] of [
            [55, 'WARN'],
            [20, 'INFO'],
        ] as const) {
            const kept = grade(error({ readerSeverity, quotes: undefined }), 1, read);
            expect([kept.tier, kept.severity, kept.regraded]).toEqual([tier, readerSeverity, undefined]);
        }
        // A conflict is a specification defect, the owner's to decide: WARN at most, however well proved.
        expect(grade(error({ kind: 'conflict' }), 1, read)).toMatchObject({
            tier: 'WARN',
            regraded: 'conflict is a specification defect: WARN at most',
        });
        expect(grade(error({ kind: 'conflict', readerSeverity: 20 }), 1, read)).toMatchObject({ tier: 'INFO' });
        // The kinds the contract deleted are no longer graded as theirs: unknown, so INFO.
        for (const kind of ['vibes', 'mis-citation', 'bad-citation', 'uncited', 'stranded-rule'])
            expect(grade(error({ kind }), 1, read)).toMatchObject({
                tier: 'INFO',
                regraded: expect.stringContaining(kind),
            });
    });

    test('takes the bands from the thresholds it is given', () => {
        const strict = { ...THRESHOLDS, warn: 60, error: 90 };
        expect(grade(error(), 1, read, undefined, strict).tier).toBe('WARN');
        expect(grade(error({ readerSeverity: 50, quotes: undefined }), 1, read, undefined, strict).tier).toBe('INFO');
    });

    test('caps a finding against an advisory requirement below ERROR, however well proved and judged, and the build proceeds', () => {
        const advisory = new Set(['<x>#requirement-a']);
        const capped = grade(error(), 1, read, advisory);
        expect(capped).toMatchObject({ tier: 'WARN', regraded: expect.stringContaining('Advisory') });
        // With the judge gate lowered, the judge reads it and rates it critical; the cap still stands, and nothing fails.
        const open = { ...THRESHOLDS, judgeFrom: 40 };
        const [after] = applyVerdicts(
            [capped],
            new Map([[1, { judgeSeverity: 95, judgeConfidence: 95, reason: 'real and critical', scenario: 's' }]]),
            true,
            open,
        );
        expect(after).toMatchObject({ tier: 'WARN', severity: 69, regraded: expect.stringContaining('Advisory') });
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
    test("is the weakest part, a missing part runs nothing, and a reader's own claim is only a note", () => {
        const parts = new Map<number, PartReaders>([
            [1, [part(1)]],
            [2, [part(2, { coverage: { ...part(2).coverage, '5': 'sampled: long file' } })]],
            [3, [undefined]],
        ]);
        const merged = mergeCoverage(parts);
        expect(merged['5']).toMatchObject({ status: 'not-run', parts: [3] });
        expect(merged['5']!.notes).toEqual(['part 3: no findings file']);
        expect(merged['5']!.claims).toEqual(['part 2: sampled: long file']);
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

    test('covers a part any reader wrote a findings file for, whatever it claims; only a part with none ran nothing', () => {
        // A claimed shortfall, real path or made up, is a note: no tool can prove it.
        const sampled = part(2, { coverage: { ...part(2).coverage, '5': 'sampled: src/never/existed.ts' } });
        expect(partCoverage([sampled, undefined])).toEqual({ status: 'full' });
        expect(readerClaims([sampled, part(2)], '5')).toEqual(['sampled: src/never/existed.ts']);
        expect(readerClaims([part(2)], '5')).toEqual([]);
        // A completion reader names only the checks of its brief; a check it leaves out is no claim.
        expect(readerClaims([part(2, { coverage: { '5': 'full' } })], '1')).toEqual([]);
        expect(partCoverage([undefined, undefined])).toEqual({ status: 'not-run', note: 'no findings file' });
    });

    test('counts a defect two readers both found once, keeping the more severe twin', () => {
        const a = { ...grade(error(), 1, read), reader: 1 };
        const b = { ...grade(error({ where: 'said differently', readerSeverity: 55 }), 1, read), reader: 2 };
        const other = { ...grade(error({ kind: 'conflict', quotes: [] }), 1, read), reader: 2 };
        expect(dedupe([b, a, other]).map((f) => [f.kind, f.tier, f.reader])).toEqual([
            ['code-mismatch', 'ERROR', 1],
            ['conflict', 'WARN', 2],
        ]);
    });

    test('fails on an ERROR above 80%, is ADVISORY on ERRORs at 80% or lower, passes when everything ran in full', () => {
        const full = mergeCoverage(new Map([[1, [part(1)]]]));
        const at = (readerConfidence: number): Graded => grade(error({ readerConfidence }), 1, read);
        expect(verdict([at(90)], full).line).toBe('FAIL (1 errors, 0 warnings)');
        expect(verdict([at(81)], full).state).toBe('FAIL');
        expect(verdict([at(80)], full).line).toBe('ADVISORY (1 errors, 0 warnings)');
        expect(verdict([at(71)], full).state).toBe('ADVISORY');
        // Severe but not sure enough: a WARN.
        expect(verdict([at(70)], full).line).toBe('PASS (0 errors, 1 warnings)');
        expect(verdict([at(90)], full, { ...THRESHOLDS, blocking: 95 }).state).toBe('ADVISORY');
        expect([exitCodeFor('FAIL'), exitCodeFor('ADVISORY'), exitCodeFor('INCOMPLETE'), exitCodeFor('PASS')]).toEqual([
            1, 77, 3, 0,
        ]);
        expect(verdict([grade(error({ kind: 'untested' }), 1, read)], full).line).toBe('PASS (0 errors, 0 warnings)');
    });
});

describe('applyVerdicts — the judge over the severe and sure findings', () => {
    const graded = (over: Partial<Finding> = {}) => grade(error(over), 1, read);
    const judge = (judgeSeverity: number, judgeConfidence: number, reason = 'r', scenario?: string) => ({
        judgeSeverity,
        judgeConfidence,
        reason,
        ...(scenario ? { scenario } : {}),
    });
    const SCENARIO = 'an operator applies it and the write lands on another queue';

    test("fuses a judge's agreeing reading with the reader's: the ERROR stands, with the reason, scenario and readings", () => {
        const [kept] = applyVerdicts(
            [graded()],
            new Map([[1, judge(85, 85, 'the write lands elsewhere', SCENARIO)]]),
            true,
        );
        expect(kept).toMatchObject({
            tier: 'ERROR',
            severity: 83,
            confidence: 85,
            readerSeverity: 80,
            judgeSeverity: 85,
            judgeConfidence: 85,
            verified: 'judge: severity 85 at 85% — the write lands elsewhere',
            scenario: expect.stringContaining('another queue'),
        });
    });

    test('lowers a finding the judge rates minor or untrue, and lifts the confidence of a weak confirmation when the reader is sure', () => {
        const [lowered] = applyVerdicts([graded()], new Map([[1, judge(30, 85, 'no production effect')]]), true);
        expect(lowered).toMatchObject({ tier: 'WARN', severity: 51, confidence: 70 });
        const [lifted] = applyVerdicts(
            [graded({ readerSeverity: 90, readerConfidence: 90 })],
            new Map([[1, judge(78, 76, 'real', SCENARIO)]]),
            true,
        );
        expect(lifted).toMatchObject({ tier: 'ERROR', severity: 86, confidence: 90 });
    });

    test('caps a finding below ERROR when the judge rates it ERROR with no production scenario', () => {
        const [out] = applyVerdicts([graded({ readerConfidence: 60 })], new Map([[1, judge(95, 95, 'bad')]]), true);
        expect(out).toMatchObject({ judgeSeverity: 95, severity: 69, tier: 'WARN' });
        expect(out!.regraded).toContain('no production scenario');
    });

    test('answers each judged finding with the verdict at its position; a finding below a gate is never judged', () => {
        const first = graded();
        const second = graded({ where: '<x>#requirement-b / apps/mcp/src/x.ts:2' });
        const warn = graded({ readerSeverity: 55, where: '<x>#requirement-c' });
        const unsure = graded({ readerConfidence: 55, where: '<x>#requirement-d' });
        const out = applyVerdicts([first, warn, unsure, second], new Map([[2, judge(20, 90, 'not critical')]]), true);
        expect(out.map((f) => f.tier)).toEqual(['ERROR', 'WARN', 'WARN', 'WARN']);
        expect(out[3]!.verified).toBe('judge: severity 20 at 90% — not critical');
        expect(out[1]).toEqual(warn);
        expect(out[2]).toEqual(unsure);
    });

    test("keeps the reader's reading for a finding the pass never reached, and changes nothing without the pass", () => {
        expect(applyVerdicts([graded()], new Map(), true)[0]).toMatchObject({
            tier: 'ERROR',
            verified: expect.stringContaining("the reader's severity 80 at 80% stands"),
        });
        expect(applyVerdicts([graded({ readerConfidence: 65 })], new Map(), true)[0]).toMatchObject({
            tier: 'WARN',
            verified: expect.stringContaining('unverified'),
        });
        const f = graded();
        expect(applyVerdicts([f], new Map(), false)[0]).toEqual(f);
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
        expect(lines[0]).toBe('ADVISORY (1 errors, 0 warnings)');
        expect(md).toContain('## Advisory errors — severity 70 or more, confidence above 70%, at 80% or lower');
        expect(md).toContain(
            'Graded by: WARN from severity 40, ERROR from 70 above 70% confidence, FAIL above 80%; a severity gap up to 20 between readings costs no confidence.',
        );
        expect(md).toContain('severity 80 at 80% (reader 80 at 80%)');
        expect(lines[2]).toBe('SCOPE 1 capabilities');
        const errors = lines.filter((l) => l.startsWith('- `code-mismatch`'));
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('— The code drops the item.');
        expect(errors[0]).not.toContain('never calls preflight');
        expect(md).toContain('## Info\n\n- `untested`: 1');
        expect(md).not.toContain('Coverage short');
        expect(md).not.toContain('Quotes');
    });

    test("lists the checks that fell short, and a reader's own claim as a note that changes no verdict", () => {
        const claimed = part(1, { coverage: { ...part(1).coverage, '5': 'sampled: one test unread' } });
        const md = render(['SCOPE all'], [], mergeCoverage(new Map([[1, [claimed]]])), []);
        expect(md.split('\n')[0]).toBe('PASS (0 errors, 0 warnings)');
        expect(md).not.toContain('Coverage short');
        expect(md).toMatch(
            /## Readers' coverage notes\n\n.*\n\n- 5\. A rule whose tests satisfy the wording while failing to protect the intent: part 1: sampled: one test unread/,
        );
        const short = render(
            ['SCOPE all'],
            [],
            mergeCoverage(
                new Map([
                    [1, [claimed]],
                    [2, [undefined]],
                ]),
            ),
            [],
        );
        expect(short.split('\n')[0]).toBe('INCOMPLETE (0 errors, 0 warnings)');
        expect(short).toMatch(/## Coverage short\n\n- 1\. Gap honesty: not-run — parts 2 — part 2: no findings file/);
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

    test('lists the requirements no judged list names and a part with no findings file, never a claimed skip, and leaves a covered part out', () => {
        const parts = new Map<number, PartReaders>([
            // Every requirement judged; the reader claims it could not read a source. A second reader would meet the same
            // limit: the claim is a note in the report, not work for the completion pass.
            [1, [reader({ coverage: { ...reader().coverage, '4': 'sampled: .env values (secret-file rule)' } })]],
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
            { part: 2, requirementIds: ['y#a'], checks: {} },
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
            '.spec-audit/parts/findings/part-1-1.yaml',
            '.spec-audit/parts/findings/part-1-2.yaml',
            '.spec-audit/parts/findings/part-11-2.yaml',
            '.spec-audit/parts/findings/worker-1.jsonl',
        ];
        expect(readerFiles(['.spec-audit/parts/findings/part-1-1.yaml'], present, 1)).toEqual([
            '.spec-audit/parts/findings/part-1-1.yaml',
            '.spec-audit/parts/findings/part-1-2.yaml',
        ]);
        expect(readerFiles(['.spec-audit/parts/findings/part-11-1.yaml'], present, 11)).toEqual([
            '.spec-audit/parts/findings/part-11-1.yaml',
            '.spec-audit/parts/findings/part-11-2.yaml',
        ]);
    });
});

describe('the reader findings schema — a file the report cannot read makes its reader not run', () => {
    const file = (findings: unknown[]) => toYaml({ findings, coverage: { '1': 'full' }, judged: ['a'] });

    test('passes findings that carry every field the report reads', () => {
        expect(checkData(file([error(), error({ readerSeverity: 55, quotes: undefined })]), READER_FINDINGS)).toEqual(
            [],
        );
    });

    test('names each missing or wrong field, so the worker corrects it, or the completion pass re-reads its part', () => {
        const { detail: _detail, readerConfidence: _confidence, ...summarized } = error();
        expect(checkData(file([error(), { ...summarized, summary: 'does not attach' }]), READER_FINDINGS)).toEqual([
            'findings[1].detail: missing',
            'findings[1].readerConfidence: missing',
        ]);
        expect(checkData(file([error({ readerConfidence: 101 })]), READER_FINDINGS)).toEqual([
            'findings[0].readerConfidence: must be an integer from 0 to 100',
        ]);
        const { readerSeverity: _severity, ...tiered } = error();
        expect(checkData(file([{ ...tiered, tier: 'ERROR' }]), READER_FINDINGS)).toEqual([
            'findings[0].readerSeverity: missing',
        ]);
        expect(checkData('findings: [\n  - x', READER_FINDINGS)[0]).toMatch(/^line \d+: not valid YAML/);
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

const rules = (name: string) => skill(`spec-tools/references/rules/${name}.md`);

/** spec-verify's checks that are spec-steward items: check number, the item it is. */
const SHARED: Record<string, string> = { '2': '10', '3': '9', '4': '11', '5': '5' };
const shared = Object.entries(SHARED).map(([check, criterion]) => ({ check, name: CHECKS[check]!, criterion }));

describe('the audits share their criteria', () => {
    test('the spec-verify rules head one section with each check name the merged report uses', () => {
        const headings = [...rules('spec-verify').matchAll(/^## (.+)$/gm)].map(([, heading]) => heading);
        expect(Object.values(CHECKS).filter((name) => !headings.includes(name))).toEqual([]);
    });

    test('each shared check is worded exactly as its spec-steward item', () => {
        const steward = rules('spec-steward');
        for (const { name, criterion } of shared) {
            expect(steward).toMatch(
                new RegExp(`^${criterion}\\. ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`, 'm'),
            );
        }
    });
});
