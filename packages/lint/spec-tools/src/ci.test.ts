import { describe, expect, test } from 'vitest';

import { diffBase, isNightly, jobLog, mergeRequest, pipeline, shard } from './ci';

describe('ci', () => {
    test('diffs against the merge request base, then a push before-commit, else HEAD', () => {
        expect(
            diffBase({ CI_MERGE_REQUEST_DIFF_BASE_SHA: 'abc', CI_COMMIT_SHA: 'def', CI_COMMIT_BEFORE_SHA: 'ghi' }),
        ).toBe('abc');
        expect(diffBase({ CI_COMMIT_SHA: 'def', CI_COMMIT_BEFORE_SHA: 'ghi' })).toBe('ghi');
        expect(diffBase({ CI_COMMIT_SHA: 'def', CI_COMMIT_BEFORE_SHA: '0'.repeat(40) })).toBe('HEAD^');
        expect(diffBase({})).toBe('HEAD');
    });

    test('names the merge request, the nightly, the shard, the job log and the pipeline links', () => {
        expect(shard({})).toEqual({ index: 1, total: 1 });
        expect(shard({ CI_NODE_INDEX: '2', CI_NODE_TOTAL: '8' })).toEqual({ index: 2, total: 8 });
        expect(mergeRequest({})).toBeNull();
        expect(mergeRequest({ CI_MERGE_REQUEST_IID: '7', CI_MERGE_REQUEST_DRAFT: 'true' })).toEqual({ draft: true });
        expect(isNightly({ SPEC_AUDIT_NIGHTLY: 'true' })).toBe(true);
        expect(jobLog({ CI_JOB_NAME: 'review' })).toBe('.spec-audit/job-log-review.md');
        expect(pipeline({ CI_JOB_URL: 'https://ci/job/1' }).artifacts).toBe('https://ci/job/1/artifacts/file');
    });
});
