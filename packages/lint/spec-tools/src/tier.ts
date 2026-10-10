/**
 * The one place a run's audit class is decided, and the only description of the run classes — documents and skills
 * point here. Every job reads the answer and none carries model or tier logic of its own: `spec-tools tier` prints it
 * as dotenv lines (KEY=value) that the first audit job sources and hands on as a dotenv artifact, so the audit jobs
 * after it and the review renderer act on the same decision.
 *
 *   run              decided by                                        scope     judge      gating
 *   nightly          the pipeline's SPEC_AUDIT_NIGHTLY=true            corpus    expensive  advisory
 *   draft            a draft merge request                             affected  cheap      advisory
 *   open-change      a merge request touching an open change, with     affected  cheap      advisory
 *                    deltas (workflow-evidence blocks its merge) or
 *                    without (a `skip_specs` folder not yet archived)
 *   merge-request    a merge request touching no open change           affected  cheap      gating
 *   default-branch   anything else: a default-branch push              affected  expensive  gating
 *
 * Only the nightly audits the corpus. Every other run audits its affected set (`auditChanged.ts`) against the diff
 * base `ci.ts` names. Every run reads on the cheap model (AUDIT_MODEL / AUDIT_EFFORT) — the reading and the completion
 * pass alike; the judge — the verifier of every ERROR the reading left standing — runs on AUDIT_MODEL_VERIFY /
 * AUDIT_EFFORT_VERIFY: the expensive model where the run is the default branch's (a push, the nightly), the cheap one
 * on a merge request. Each run stands alone. The nightly reports and never gates: two nightlies over the same commit
 * can find different ERRORs.
 *
 * A reading job runs AUDIT_SLOTS workers at a time (`workersFor`); how many reading jobs there are is the pipeline's
 * choice (AUDIT_JOBS, its `parallel:`), and the scope is cut for one round across them.
 *
 * The rows are decided in that order. Which open changes a merge request touches, and whether they carry deltas, is
 * workflow-evidence's classification against the gate base; a classification that fails fails the run class, rather
 * than reading as a request that touches nothing. The model and effort here reach every worker of the audit; a
 * skill's frontmatter applies to an in-chat run only.
 */
import { deltaFilesInOpenChanges, syncedUnarchivedChanges, touchedOpenChanges } from './changeGates';
import { gateBase, isNightly, mergeRequest } from './ci';
import { classify, type OpenChangeClass } from './workflowEvidence';

export type RunClass = 'nightly' | 'draft' | 'open-change' | 'merge-request' | 'default-branch';

export type Tier = {
    readonly AUDIT_RUN: RunClass;
    readonly AUDIT_SCOPE: 'corpus' | 'affected';
    readonly AUDIT_GATING: 'gating' | 'advisory';
    readonly AUDIT_MODEL: string;
    readonly AUDIT_EFFORT: string;
    readonly AUDIT_MODEL_VERIFY: string;
    readonly AUDIT_EFFORT_VERIFY: string;
    /** Workers a reading job runs at once; the scope cuts AUDIT_JOBS × that many parts, one round of workers. */
    readonly AUDIT_SLOTS: number;
};

export const CHEAP_MODEL = 'claude-haiku-5-5';
export const CHEAP_EFFORT = 'high';
export const EXPENSIVE_MODEL = 'claude-sonnet-5-5';
export const EXPENSIVE_EFFORT = 'medium';

/**
 * A headless worker's resident memory: about 500 MB, 590 MB at the most over 24 workers on the cheap tier with 72 KB
 * parts. Each pass logs the job's memory peak, from which it is re-measured.
 */
export const WORKER_BYTES = 600 * 1024 ** 2;
/** Workers per reading job unless AUDIT_WORKERS says otherwise — conservative until the logged peaks show room. */
export const DEFAULT_WORKERS = 2;
/** A reading job's memory unless AUDIT_JOB_MEMORY says otherwise: the scope runs elsewhere and cannot measure it. */
export const DEFAULT_JOB_MEMORY = 2 * 1024 ** 3;

/** `2Gi`, `2G`, `1536Mi`, `512M` or bare bytes, in bytes; binary units either way, as a container limit is. */
export function memoryOf(text: string): number {
    const m = /^(\d+(?:\.\d+)?)\s*([KMGT]?)i?B?$/i.exec(text.trim());
    if (!m) throw new Error(`bad memory size: ${text}`);
    return Math.round(Number(m[1]) * 1024 ** ' KMGT'.indexOf((m[2] || ' ').toUpperCase()));
}

/** Workers a job of `memory` bytes runs at once: as many as fit, never more than AUDIT_WORKERS, at least one. */
export const workersFor = (env: NodeJS.ProcessEnv, memory: number): number =>
    Math.max(1, Math.min(Number(env.AUDIT_WORKERS) || DEFAULT_WORKERS, Math.floor(memory / WORKER_BYTES)));

/** The open changes this merge request touches, by workflow-evidence's classification against the gate base. */
export function openChangeClass(env: NodeJS.ProcessEnv = process.env): OpenChangeClass {
    const base = gateBase(env);
    const touched = base === null ? [] : touchedOpenChanges(base);
    return classify(touched, { openDeltas: deltaFilesInOpenChanges(), syncedUnarchived: syncedUnarchivedChanges() });
}

/** The run class and what follows from it; `openChange` answers only for a non-draft merge request. */
export function tier(
    env: NodeJS.ProcessEnv = process.env,
    openChange = (): OpenChangeClass => openChangeClass(env),
): Tier {
    const mr = mergeRequest(env);
    const run: RunClass = isNightly(env)
        ? 'nightly'
        : !mr
          ? 'default-branch'
          : mr.draft
            ? 'draft'
            : openChange() === 'none'
              ? 'merge-request'
              : 'open-change';
    const cheap = [env.AUDIT_MODEL_CHEAP || CHEAP_MODEL, env.AUDIT_EFFORT_CHEAP || CHEAP_EFFORT] as const;
    const expensive = [env.AUDIT_MODEL_EXPENSIVE || EXPENSIVE_MODEL, env.AUDIT_EFFORT_EXPENSIVE || EXPENSIVE_EFFORT];
    const judge = run === 'nightly' || run === 'default-branch' ? expensive : cheap;
    return {
        AUDIT_RUN: run,
        AUDIT_SCOPE: run === 'nightly' ? 'corpus' : 'affected',
        AUDIT_GATING: run === 'merge-request' || run === 'default-branch' ? 'gating' : 'advisory',
        AUDIT_MODEL: cheap[0],
        AUDIT_EFFORT: cheap[1],
        AUDIT_MODEL_VERIFY: judge[0]!,
        AUDIT_EFFORT_VERIFY: judge[1]!,
        AUDIT_SLOTS: workersFor(env, env.AUDIT_JOB_MEMORY ? memoryOf(env.AUDIT_JOB_MEMORY) : DEFAULT_JOB_MEMORY),
    };
}

/** `spec-tools tier`: the run class as dotenv lines. */
export const dotenv = (t: Tier): string =>
    Object.entries(t)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') + '\n';
