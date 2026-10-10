import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { comment, verdictRow } from './comment';

describe('comment', () => {
    const cwd = process.cwd();
    beforeEach(() => process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'spec-tools-comment-'))));
    afterEach(() => process.chdir(cwd));

    test('reads a verdict row from the fixed first line, and NOT RUN where no report came', () => {
        expect(verdictRow('FAIL (3 errors, 1 warning)\n')).toEqual({ state: 'FAIL', errors: 3, warnings: 1 });
        expect(verdictRow(undefined)).toEqual({ state: 'NOT RUN', errors: 0, warnings: 0 });
    });

    test("writes one row per review, linked to this job's artifacts, with the coverage and the diff beneath", () => {
        fs.writeFileSync('spec-verify.md', 'PASS (0 errors, 2 warnings)\n');
        fs.writeFileSync('spec-coverage.md', '# coverage\n');
        fs.writeFileSync('spec-diff.md', 'SPEC DIFF 1 changed\n');
        const text = comment(['spec-verify=spec-verify.md', 'other=other.md'], {
            CI_JOB_URL: 'https://ci/job/1',
            AUDIT_GATING: 'advisory',
        });
        expect(text).toContain('| spec-verify | ✅ OK | 0 | 2 | [md](https://ci/job/1/artifacts/file/spec-verify.md)');
        expect(text).toContain('| other | ⚠️ NOT RUN | 0 | 0 |');
        expect(text).toContain('Coverage: [md](https://ci/job/1/artifacts/file/spec-coverage.md)');
        expect(text).toContain('Specification diff — SPEC DIFF 1 changed');
        expect(text).toContain('This was an advisory run');
        expect(fs.readFileSync('mr-comment.md', 'utf8')).toBe(text);
    });
});
