/**
 * Every pipeline variable the tools read, in one place: where a run's bases, its merge request and its shard come
 * from. GitLab CI's variables today; another CI is one more branch here, never a read anywhere else. The gate base is
 * spec-steward's own resolver, so the corpus gate and the change gates always judge against the same commit.
 */
import { jobLogFile } from './files';
import { git, root } from './repo';
import { resolveBase } from './steward/lib/git';

type Env = NodeJS.ProcessEnv;

/**
 * The base a branch's own changes are judged against: a merge request's diff base, which is already the merge base;
 * none in any other pipeline — a default-branch push or the nightly has no branch of its own; locally, the merge base
 * with the default branch.
 */
export function gateBase(env: Env = process.env, rootDir: string = root()): string | null {
    const base = resolveBase(rootDir, 'auto', env);
    if ('error' in base) throw new Error(base.error);
    return base.ref;
}

/**
 * What a run diffs against: the merge request's diff base, the merge base with its target branch, a push's own
 * before-commit (the previous tip, or the parent of a pushed branch's first commit), or `HEAD` — the working tree's own
 * edits, which is what an author previews before handing back.
 */
export function diffBase(env: Env = process.env): string {
    if (env.CI_MERGE_REQUEST_DIFF_BASE_SHA) return env.CI_MERGE_REQUEST_DIFF_BASE_SHA;
    if (env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME)
        return git(['merge-base', `origin/${env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME}`, 'HEAD']).trim();
    // A push: the tip before it, which is all zeros on a branch's first push.
    if (env.CI_COMMIT_SHA) return /^0*$/.test(env.CI_COMMIT_BEFORE_SHA ?? '') ? 'HEAD^' : env.CI_COMMIT_BEFORE_SHA!;
    return 'HEAD';
}

/** The scheduled run that audits the whole corpus: the pipeline's `SPEC_AUDIT_NIGHTLY`. */
export const isNightly = (env: Env = process.env): boolean => env.SPEC_AUDIT_NIGHTLY === 'true';

/** The merge request this pipeline runs for, or null outside one. */
export function mergeRequest(env: Env = process.env): { readonly draft: boolean; readonly target?: string } | null {
    if (!env.CI_MERGE_REQUEST_IID && !env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME) return null;
    return { draft: env.CI_MERGE_REQUEST_DRAFT === 'true', target: env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME };
}

/** Where a headless audit's streamed result is kept for the job log and the verdict gate: one file per job. */
export const jobLog = (env: Env = process.env): string => jobLogFile(env.CI_JOB_NAME ?? 'local');

/** What a merge-request comment links to: this job's artifacts and this pipeline, or nothing outside CI. */
export function pipeline(env: Env = process.env): {
    readonly artifacts?: string;
    readonly id?: string;
    readonly url?: string;
} {
    return {
        artifacts: env.CI_JOB_URL && `${env.CI_JOB_URL}/artifacts/file`,
        id: env.CI_PIPELINE_IID,
        url: env.CI_PIPELINE_URL,
    };
}

/** This job's share of a parallel audit: job `index` of `total`, both 1-based; one job outside a parallel matrix. */
export function shard(env: Env = process.env): { readonly index: number; readonly total: number } {
    const total = Number(env.CI_NODE_TOTAL ?? 1) || 1;
    const index = Number(env.CI_NODE_INDEX ?? 1) || 1;
    return { index, total };
}
