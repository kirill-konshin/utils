import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, test } from 'vitest';

import type { Part } from './auditScope';
import { findingsFile } from './files';
import { concurrency, duration, memoryLine, shareOf, treeChanges, workers } from './workers';

/** A test that spawns git and workers in a throwaway repository: each can take seconds on a busy machine. */
const TIMEOUT = 60_000;

/**
 * A repository holding a scope of `parts` parts, and a stand-in `claude` on the PATH that writes the findings file its
 * brief names and nothing else — so a run shows exactly which parts were started.
 */
const repository = (parts: number) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-tools-workers-'));
    const scope = {
        scope: 'all',
        readers: 1,
        parts: Array.from({ length: parts }, (_, i) => ({
            part: i + 1,
            capabilities: [`cap-${i + 1}`],
            files: [`audit-parts/cap-${i + 1}.md`],
            findings: [findingsFile(i + 1, 1)],
            requirementIds: [`cap-${i + 1}#requirement-r`],
            bytes: 1024,
            requirements: 1,
        })),
    };
    fs.writeFileSync(path.join(dir, 'audit-scope.json'), JSON.stringify(scope));
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(
        path.join(bin, 'claude'),
        '#!/usr/bin/env bash\n' +
            'file=$(sed -n \'s/^- findings file to write (Write tool, overwrite, nothing else): //p\' <<<"$2")\n' +
            'echo \'{"findings":[],"coverage":{},"judged":[]}\' > "$file"\n',
        { mode: 0o755 },
    );
    execFileSync('git', ['init', '-q'], { cwd: dir });
    fs.writeFileSync(path.join(dir, '.gitignore'), 'bin/\n');
    return { dir, bin };
};

const read = async (parts: number, env: Record<string, string> = {}, { dir, bin } = repository(parts)) => {
    const lines: string[] = [];
    const code = await workers('read', {
        cwd: dir,
        env: { PATH: `${bin}:${process.env.PATH}`, HOME: os.homedir(), AUDIT_WORKERS: '2', ...env },
        log: (line) => lines.push(line),
    });
    const written = fs
        .readdirSync(path.join(dir, 'audit-parts', 'findings'))
        .filter((f) => /^part-\d+-1\.json$/.test(f))
        .map((f) => Number(f.split('-')[1]))
        .sort((a, b) => a - b);
    return { code, written, out: lines.join('\n') };
};

describe('workers, the reading', () => {
    test(
        'reads every part outside a parallel job',
        async () => {
            const { code, written } = await read(3);
            expect(code).toBe(0);
            expect(written).toEqual([1, 2, 3]);
        },
        TIMEOUT,
    );

    test(
        'reads in a parallel job only the parts dealt to it in turn',
        async () => {
            const { code, written, out } = await read(7, { CI_NODE_INDEX: '2', CI_NODE_TOTAL: '3' });
            expect(code).toBe(0);
            expect(written).toEqual([2, 5]);
            expect(out).toContain('2 parts — job 2 of 3, its share of 7');
        },
        TIMEOUT,
    );

    test(
        "leaves the other jobs' findings alone, so the jobs of one run can share a tree",
        async () => {
            const repo = repository(5);
            await read(5, { CI_NODE_INDEX: '1', CI_NODE_TOTAL: '2' }, repo);
            const { written } = await read(5, { CI_NODE_INDEX: '2', CI_NODE_TOTAL: '2' }, repo);
            expect(written).toEqual([1, 2, 3, 4, 5]);
        },
        TIMEOUT,
    );

    test(
        'has nothing to do in a job whose share is empty',
        async () => {
            const { code, written, out } = await read(2, { CI_NODE_INDEX: '3', CI_NODE_TOTAL: '3' });
            expect(code).toBe(0);
            expect(written).toEqual([]);
            expect(out).toContain('no part to read — job 3 of 3, its share of 2');
        },
        TIMEOUT,
    );

    test(
        'refuses to start without a scope',
        async () => {
            const { dir } = repository(1);
            fs.rmSync(path.join(dir, 'audit-scope.json'));
            expect(await workers('read', { cwd: dir, log: () => {} })).toBe(2);
        },
        TIMEOUT,
    );

    test(
        'fails a pass that changed a file outside the audit outputs',
        async () => {
            const repo = repository(1);
            fs.appendFileSync(path.join(repo.bin, 'claude'), 'echo edited > source.ts\n');
            const { code } = await read(1, {}, repo);
            expect(code).toBe(1);
        },
        TIMEOUT,
    );
});

describe('workers, the pieces', () => {
    test('deals part p to job ((p - 1) mod total) + 1', () => {
        const parts = [1, 2, 3, 4, 5].map((part) => ({ part }) as Part);
        expect(shareOf(parts, { index: 2, total: 2 }).map((p) => p.part)).toEqual([2, 4]);
    });

    test('in a container runs as many workers as its memory holds, two unless AUDIT_WORKERS raises it', () => {
        const gb = 1024 ** 3;
        expect(concurrency({}, 3 * gb)).toBe(2);
        expect(concurrency({ AUDIT_WORKERS: '16' }, 3 * gb)).toBe(10);
        expect(concurrency({ AUDIT_WORKERS: '8' }, 0.25 * gb)).toBe(1);
        expect(concurrency({ AUDIT_WORKERS: '4' }, null)).toBe(4);
        expect(concurrency({}, null)).toBe(0);
    });

    test('logs the memory a pass used, in a container only', () => {
        const gb = 1024 ** 3;
        expect(memoryLine(2 * gb, 1.5 * gb)).toBe('memory: peak 1.50 GB of a 2.00 GB limit');
        expect(memoryLine(2 * gb, null)).toBe('memory: peak unknown of a 2.00 GB limit');
        expect(memoryLine(null, null)).toBeUndefined();
    });

    test('reads a time budget', () => {
        expect(duration('20m')).toBe(1_200_000);
        expect(duration('90s')).toBe(90_000);
        expect(duration('45')).toBe(45_000);
    });

    test('ignores what a pass may write and names what it may not', () => {
        const before = new Map([['a.ts', '1']]);
        const after = new Map([
            ['a.ts', '2'],
            ['audit-parts/findings/part-1-1.json', 'x'],
            ['spec-verify.md', 'y'],
        ]);
        expect(treeChanges(before, after)).toEqual(['a.ts']);
    });
});
