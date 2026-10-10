import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, test } from 'vitest';

import { exitFor, gate, verdictOf } from './verdict';

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'spec-tools-verdict-'));

describe('verdict', () => {
    test('reads a Markdown report on its first verdict line and a JSON report as data', () => {
        expect(verdictOf('r.md', 'FAIL (2 errors, 1 warning)\n\nbody')).toBe('FAIL');
        expect(verdictOf('r.json', JSON.stringify({ verdict: 'INCOMPLETE (0 errors, 3 warnings)' }))).toBe(
            'INCOMPLETE',
        );
        expect(verdictOf('r.md', 'no verdict here')).toBeNull();
    });

    test('carries PASS as 0, FAIL as 1 or 77 on an advisory run, INCOMPLETE as 3, and nothing as 1', () => {
        expect(exitFor('PASS', false)).toBe(0);
        expect(exitFor('FAIL', false)).toBe(1);
        expect(exitFor('FAIL', true)).toBe(77);
        expect(exitFor('INCOMPLETE', true)).toBe(3);
        expect(exitFor(null, true)).toBe(1);
    });

    test('recovers a report the skill printed but did not write, from the job log', () => {
        const d = dir();
        const log = path.join(d, 'job-log.md');
        fs.writeFileSync(log, '# Report\n\nPASS (0 errors, 2 warnings)\n');
        const report = path.join(d, 'report.md');
        expect(gate(report, log, false)).toBe(0);
        expect(fs.readFileSync(report, 'utf8').split('\n')[0]).toBe('PASS (0 errors, 2 warnings)');
    });

    test('fails a review that wrote no report and printed no verdict', () => {
        const d = dir();
        const log = path.join(d, 'job-log.md');
        fs.writeFileSync(log, 'the review stopped early\n');
        expect(gate(path.join(d, 'report.md'), log, false)).toBe(1);
    });
});
