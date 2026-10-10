import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, test } from 'vitest';

import { toYaml } from './data';
import { exitFor, gate, reviewVerdict, verdictOf } from './verdict';

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'spec-tools-verdict-'));

const finding = (tier: 'ERROR' | 'WARN', readerConfidence: number) => ({
    tier,
    where: 'apps/x.ts:12',
    detail: 'the write addresses another record',
    readerConfidence,
    fields: { entity: 'QueueEntity' },
});

describe('verdict', () => {
    test('reads a Markdown report on its first verdict line, and the merge data as its verdict field', () => {
        const d = dir();
        expect(verdictOf('r.md', 'FAIL (2 errors, 1 warning)\n\nbody')).toBe('FAIL');
        expect(verdictOf('r.md', 'ADVISORY (1 errors, 0 warnings)')).toBe('ADVISORY');
        expect(verdictOf('r.md', 'no verdict here')).toBeNull();
        const data = path.join(d, 'spec-verify.yaml');
        fs.writeFileSync(data, toYaml({ verdict: 'INCOMPLETE (0 errors, 3 warnings)', findings: [] }));
        expect(verdictOf(data, fs.readFileSync(data, 'utf8'))).toBe('INCOMPLETE');
    });

    test('carries PASS as 0, FAIL as 1 or 77 on an advisory run, ADVISORY as 77, INCOMPLETE as 3, and nothing as 1', () => {
        expect(exitFor('PASS', false)).toBe(0);
        expect(exitFor('FAIL', false)).toBe(1);
        expect(exitFor('FAIL', true)).toBe(77);
        expect(exitFor('ADVISORY', false)).toBe(77);
        expect(exitFor('INCOMPLETE', true)).toBe(3);
        expect(exitFor(null, true)).toBe(1);
    });

    test('computes a review report’s verdict itself: an ERROR counts above 70%, fails above 80%, an incomplete review is INCOMPLETE', () => {
        const complete = { complete: true };
        expect(reviewVerdict({ findings: [finding('ERROR', 70)], coverage: complete }).line).toBe(
            'PASS (0 errors, 1 warnings)',
        );
        expect(reviewVerdict({ findings: [finding('ERROR', 71)], coverage: complete }).line).toBe(
            'ADVISORY (1 errors, 0 warnings)',
        );
        expect(reviewVerdict({ findings: [finding('ERROR', 81)], coverage: complete }).state).toBe('FAIL');
        expect(reviewVerdict({ findings: [], coverage: { complete: false } }).state).toBe('INCOMPLETE');
    });

    test('renders the Markdown report beside a review report and gates on the computed verdict', () => {
        const d = dir();
        const report = path.join(d, 'entity-hacks.yaml');
        fs.writeFileSync(
            report,
            toYaml({ title: 'Entity hacks', findings: [finding('ERROR', 90)], coverage: { complete: true } }),
        );
        expect(gate(report, true)).toBe(77);
        const md = fs.readFileSync(path.join(d, 'entity-hacks.md'), 'utf8');
        expect(md.split('\n')[0]).toBe('FAIL (1 errors, 0 warnings)');
        expect(md).toContain('| ERROR | `apps/x.ts:12` | QueueEntity | the write addresses another record | 90% |');
    });

    test('fails a review that wrote no report', () => {
        expect(gate(path.join(dir(), 'report.yaml'), false)).toBe(1);
    });
});
