/**
 * The files the audit passes hand to one another — all under one folder at the repository root, `.spec-audit/`, so a
 * consumer ignores one path and publishes one artifact. Every intermediate file is YAML (`data.ts`); Markdown is
 * written only at the end, for people. Kept apart from the modules that write them so a pass that only reads them — the
 * merge, the workers — never loads what the writers need (the TypeScript compiler).
 */

/** The one folder every spec-tools output lives in: ignored by git, published by CI as the job's artifact. */
export const AUDIT_DIR = '.spec-audit';
/** The evidence each part's reader judges; the audits write their findings beneath it. */
export const PARTS_DIR = `${AUDIT_DIR}/parts`;
/** Every unit in scope with its class, for the merge to grade a finding against an ⚠️ Advisory requirement. */
export const UNITS_FILE = `${PARTS_DIR}/units.yaml`;
/** spec-steward's evidence model, which the scope writes before it cuts the evidence. */
export const EVIDENCE_FILE = `${AUDIT_DIR}/evidence.yaml`;
/** The coverage data, and the Markdown report rendered from it. */
export const COVERAGE_DATA = `${AUDIT_DIR}/coverage.yaml`;
export const COVERAGE_REPORT = `${AUDIT_DIR}/coverage.md`;
/** The specification diff, by requirement: a report for people. */
export const DIFF_FILE = `${AUDIT_DIR}/spec-diff.md`;
/** The merge-request comment of a pipeline's reviews. */
export const COMMENT_FILE = `${AUDIT_DIR}/mr-comment.md`;
/** A headless review's whole stream (`spec-tools run`). */
export const STREAM_FILE = `${AUDIT_DIR}/claude.jsonl`;

/** The audits the engine runs: the code-conformance audit and spec-steward's corpus-quality audit. */
export type AuditName = 'spec-verify' | 'spec-steward';
export const AUDIT_NAMES: readonly AuditName[] = ['spec-verify', 'spec-steward'];

/** Where one audit keeps its scope, its workers' files, its merged data and its rendered report. */
export type AuditFiles = {
    /** The scope and its partition as data — what the workers and the merge read. */
    readonly scope: string;
    readonly findings: string;
    /** The merged findings as data — what the completion pass reads its short list from, and the verification pass its targets. */
    readonly data: string;
    /** The report: spec-verify's Markdown verdict report, or spec-steward's YAML review file the owner edits. */
    readonly report: string;
    /** Touched by the verification pass when it starts, so the merge knows a target without a verdict was not reached rather than not put to it. */
    readonly verified: string;
};

export const AUDIT_FILES: Readonly<Record<AuditName, AuditFiles>> = {
    'spec-verify': {
        scope: `${AUDIT_DIR}/scope.yaml`,
        findings: `${PARTS_DIR}/findings`,
        data: `${AUDIT_DIR}/spec-verify.yaml`,
        report: `${AUDIT_DIR}/spec-verify.md`,
        verified: `${PARTS_DIR}/findings/.verified`,
    },
    'spec-steward': {
        scope: `${AUDIT_DIR}/steward/scope.yaml`,
        findings: `${AUDIT_DIR}/steward/findings`,
        data: `${AUDIT_DIR}/steward/review-data.yaml`,
        report: `${AUDIT_DIR}/spec-review.yaml`,
        verified: `${AUDIT_DIR}/steward/findings/.verified`,
    },
};

const VERIFY = AUDIT_FILES['spec-verify'];
export const SCOPE_FILE = VERIFY.scope;
export const FINDINGS_DIR = VERIFY.findings;
export const REPORT_FILE = VERIFY.report;
export const REPORT_DATA = VERIFY.data;
export const VERIFIED_MARKER = VERIFY.verified;

/** Where one reader of one part writes its findings. */
export const findingsFile = (part: number, reader: number, audit: AuditName = 'spec-verify'): string =>
    `${AUDIT_FILES[audit].findings}/part-${part}-${reader}.yaml`;

/** Where the verifier of the k-th target writes its verdict. */
export const verdictFile = (k: number, audit: AuditName = 'spec-verify'): string =>
    `${AUDIT_FILES[audit].findings}/verdict-${k}.yaml`;

/** Where a headless audit's streamed result is kept for the job log and the verdict gate: one file per job. */
export const jobLogFile = (job: string): string => `${AUDIT_DIR}/job-log-${job}.md`;
