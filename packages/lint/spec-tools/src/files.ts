/**
 * The files the audit passes hand to one another, at the repository root. Kept apart from the modules that write them so
 * a pass that only reads them — the merge, the workers — never loads what the writers need (the TypeScript compiler).
 */

/** The evidence each part's reader judges; the audits write their findings beneath it. */
export const PARTS_DIR = 'audit-parts';
/** Every unit in scope with its class, for the merge to grade a finding against an ⚠️ Advisory requirement. */
export const UNITS_FILE = `${PARTS_DIR}/units.json`;
/** spec-steward's evidence model, which `spec-tools steward evidence --json` writes. */
export const EVIDENCE_FILE = 'spec-evidence.json';

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
    /** The rendered report: spec-verify's verdict report, or spec-steward's review file. */
    readonly report: string;
    /** Touched by the verification pass when it starts, so the merge knows a target without a verdict was not reached rather than not put to it. */
    readonly verified: string;
};

export const AUDIT_FILES: Readonly<Record<AuditName, AuditFiles>> = {
    'spec-verify': {
        scope: 'audit-scope.json',
        findings: `${PARTS_DIR}/findings`,
        data: 'spec-verify.json',
        report: 'spec-verify.md',
        verified: `${PARTS_DIR}/findings/.verified`,
    },
    'spec-steward': {
        scope: `${PARTS_DIR}/steward/scope.json`,
        findings: `${PARTS_DIR}/steward/findings`,
        data: `${PARTS_DIR}/steward/review.json`,
        report: 'spec-review.md',
        verified: `${PARTS_DIR}/steward/findings/.verified`,
    },
};

const VERIFY = AUDIT_FILES['spec-verify'];
export const SCOPE_JSON = VERIFY.scope;
export const FINDINGS_DIR = VERIFY.findings;
export const REPORT_FILE = VERIFY.report;
export const REPORT_JSON = VERIFY.data;
export const VERIFIED_MARKER = VERIFY.verified;

/** Where one reader of one part writes its findings. */
export const findingsFile = (part: number, reader: number, audit: AuditName = 'spec-verify'): string =>
    `${AUDIT_FILES[audit].findings}/part-${part}-${reader}.json`;
