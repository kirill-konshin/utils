import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, test } from 'vitest';

import type { EvidenceModel } from './auditParts';
import { AUDIT_FILES, findingsFile } from './files';
import { merge, quoteAt, type StewardData, sweepUnits } from './stewardAudit';
import { workers } from './workers';

const FILES = AUDIT_FILES['spec-steward'];
/** A test that spawns git and workers in a throwaway repository: each can take seconds on a busy machine. */
const TIMEOUT = 60_000;

const SPEC = 'openspec/specs/billing/spec.md';
const SPEC_TEXT = [
    '# billing',
    '',
    '### Requirement: Refunds are idempotent',
    '',
    'The service SHALL apply a refund at most once per request id, however often it is retried.',
    '',
    '### Requirement: Invoices are numbered',
    '',
    'Every invoice SHALL carry a number.',
    '',
].join('\n');

/** A repository with one capability and a spec-steward scope of one part and one sweep. */
function repository() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-tools-steward-'));
    const write = (file: string, text: string) => {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), text);
    };
    write(SPEC, SPEC_TEXT);
    write('AGENTS.md', '# Agents\n');
    write('.gitignore', 'bin/\n');
    const ids = ['billing#requirement-refunds-are-idempotent', 'billing#requirement-invoices-are-numbered'];
    write(
        FILES.scope,
        JSON.stringify({
            scope: 'all',
            readers: 1,
            parts: [
                {
                    part: 1,
                    capabilities: ['billing'],
                    files: ['audit-parts/billing.md'],
                    findings: [findingsFile(1, 1, 'spec-steward')],
                    requirementIds: ids,
                    bytes: 1,
                    requirements: 2,
                },
                {
                    part: 2,
                    capabilities: [],
                    files: ['AGENTS.md'],
                    findings: [findingsFile(2, 1, 'spec-steward')],
                    requirementIds: [],
                    bytes: 0,
                    requirements: 0,
                    sweep: { key: 'placement', title: 'Placement', focus: 'f' },
                },
            ],
        }),
    );
    const git = (...args: string[]) =>
        execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir });
    git('init', '-q');
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    return { dir, write, ids };
}

const finding = (over: Record<string, unknown> = {}) => ({
    file: SPEC,
    line: 5,
    quote: 'The service SHALL apply a refund at most once … however often it is retried.',
    ruleName: 'Refunds are idempotent',
    criteria: [6],
    layer: 'SPEC-ADVISORY',
    whatsWrong: 'w',
    proposed: 'Reclassify → ADVISORY',
    themeKey: 'unverifiable-absolute',
    needsHumanIntent: false,
    confidence: 'high',
    ...over,
});

const reader = (dir: string) => (file: string) => {
    try {
        return fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
    } catch {
        return undefined;
    }
};

describe('spec-steward on the shared engine', () => {
    test('finds a quote in the block at its line, elisions included, and nowhere else', () => {
        const lines = SPEC_TEXT.split('\n');
        expect(quoteAt('apply a refund … however often', lines, 5)).toBe(true);
        expect(quoteAt('apply a refund', lines, 7)).toBe(false);
        expect(quoteAt('a sentence nobody wrote', lines, 5)).toBe(false);
    });

    test(
        'adds the skill’s sweeps after the parts, each reading the files its globs or the evidence name',
        () => {
            const { dir } = repository();
            const model = {
                version: 1,
                root: dir,
                requirements: [
                    { bindings: [{ file: 'test/refunds.test.ts' }], pointers: [{ file: 'src/refunds.ts' }] },
                ],
            } as unknown as EvidenceModel;
            const sweeps = sweepUnits(model, 3, dir);
            expect(sweeps[0]!.part).toBe(4);
            expect(sweeps.find((s) => s.sweep?.key === 'placement')?.files).toEqual(['AGENTS.md']);
            expect(sweeps.find((s) => s.sweep?.key === 'compliance-theatre')?.files).toEqual(['test/refunds.test.ts']);
            expect(sweeps.find((s) => s.sweep?.key === 'comments-citations')?.files).toEqual(['src/refunds.ts']);
            expect(sweeps.every((s) => s.findings[0]!.startsWith(`${FILES.findings}/`))).toBe(true);
        },
        TIMEOUT,
    );

    test(
        'merges: drops a quote not at its line, applies verdicts, lists unjudged requirements short, offers themes',
        () => {
            const { dir, write, ids } = repository();
            const same = { themeKey: 'vague-obligation' };
            write(
                findingsFile(1, 1, 'spec-steward'),
                JSON.stringify({
                    findings: [
                        finding(),
                        finding({ line: 9, quote: 'not on that line' }),
                        finding({ line: 9, quote: 'Every invoice SHALL carry a number.', ...same }),
                    ],
                    sound: [],
                    judged: [ids[0]],
                }),
            );
            write(
                findingsFile(2, 1, 'spec-steward'),
                JSON.stringify({
                    findings: [
                        finding({ file: 'AGENTS.md', line: 1, quote: '# Agents', layer: 'AGENTS', ...same }),
                        finding({
                            file: 'AGENTS.md',
                            line: 1,
                            quote: 'Agents',
                            layer: 'AGENTS',
                            criteria: [2],
                            ...same,
                        }),
                    ],
                }),
            );
            write(`${FILES.findings}/verdict-1.json`, JSON.stringify({ verdict: 'drop', reason: 'style only' }));
            const summary = merge(reader(dir), dir);
            const data = JSON.parse(fs.readFileSync(path.join(dir, FILES.data), 'utf8')) as StewardData;
            expect(data.dropped.map((d) => [d.droppedBy, d.line])).toEqual([
                ['facts', 9],
                ['verifier', 5],
            ]);
            expect(data.short).toEqual([{ part: 1, requirementIds: [ids[1]], checks: {} }]);
            // the two AGENTS.md findings are one rule and one problem; with the spec's, three share a theme key
            expect(data.themes).toHaveLength(0);
            expect(data.findings.map((f) => f.area)).toEqual(['billing', 'placement']);
            expect(data.findings.find((f) => f.file === 'AGENTS.md')?.criteria).toEqual([6, 2]);
            expect(summary).toMatch(
                /^REVIEW 2 item\(s\) \(0 theme\(s\)\), 2 dropped, 1 part\(s\) short → spec-review\.md$/,
            );
            expect(fs.readFileSync(path.join(dir, FILES.report), 'utf8')).toMatch(/^## billing/m);
        },
        TIMEOUT,
    );

    test(
        'runs its workers on the engine, each writing the findings file its brief names',
        async () => {
            const { dir } = repository();
            const bin = path.join(dir, 'bin');
            fs.mkdirSync(bin);
            fs.writeFileSync(
                path.join(bin, 'claude'),
                '#!/usr/bin/env bash\n' +
                    'file=$(sed -n \'s/^- findings file to write (Write tool, overwrite, nothing else): //p\' <<<"$2")\n' +
                    'mkdir -p "$(dirname "$file")"; echo \'{"findings":[],"sound":[],"judged":[]}\' > "$file"\n',
                { mode: 0o755 },
            );
            const lines: string[] = [];
            const code = await workers('read', {
                audit: 'spec-steward',
                cwd: dir,
                env: { PATH: `${bin}:${process.env.PATH}`, HOME: os.homedir(), AUDIT_WORKERS: '2' },
                log: (line) => lines.push(line),
            });
            expect(code).toBe(0);
            expect(fs.readdirSync(path.join(dir, FILES.findings)).filter((f) => f.endsWith('-1.json'))).toEqual([
                'part-1-1.json',
                'part-2-1.json',
            ]);
            expect(lines.join('\n')).toContain('2 parts');
        },
        TIMEOUT,
    );
    test(
        'puts the run context — the owner decisions — into every worker brief',
        async () => {
            const { dir } = repository();
            const bin = path.join(dir, 'bin');
            fs.mkdirSync(bin);
            fs.writeFileSync(
                path.join(bin, 'claude'),
                '#!/usr/bin/env bash\n' +
                    'file=$(sed -n \'s/^- findings file to write (Write tool, overwrite, nothing else): //p\' <<<"$2")\n' +
                    'mkdir -p "$(dirname "$file")"; printf \'%s\' "$2" > "$file.prompt"; echo \'{"findings":[]}\' > "$file"\n',
                { mode: 0o755 },
            );
            await workers('read', {
                audit: 'spec-steward',
                context: 'The owner kept refunds REQUIRED on 2026-09-01.',
                cwd: dir,
                env: { PATH: `${bin}:${process.env.PATH}`, HOME: os.homedir() },
                log: () => {},
            });
            for (const part of [1, 2])
                expect(
                    fs.readFileSync(path.join(dir, `${findingsFile(part, 1, 'spec-steward')}.prompt`), 'utf8'),
                ).toContain('Run context — facts established and decisions the owner has already made');
            expect(fs.readFileSync(path.join(dir, `${findingsFile(1, 1, 'spec-steward')}.prompt`), 'utf8')).toContain(
                'The owner kept refunds REQUIRED on 2026-09-01.',
            );
        },
        TIMEOUT,
    );
});
