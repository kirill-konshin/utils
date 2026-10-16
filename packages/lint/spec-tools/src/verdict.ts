/**
 * The verdict gate of an AI review. A headless `claude --print` exits 0 whether the review passed or found violations,
 * so the report's own verdict is the only signal that the REVIEW passed — without this a review job is a publisher, not
 * a gate. The spec-verify merge's data (`.spec-audit/spec-verify.yaml`) carries its verdict as `verdict`. A
 * skill-driven review writes a review report (`data.ts` `REVIEW_REPORT`), and its verdict is computed here, mechanically,
 * never taken from the model: each finding's severity and confidence get their tier by the same thresholds as the
 * spec-verify merge (`severity.ts`) — one reading, no judge — and the review is INCOMPLETE when its coverage says so.
 * The Markdown report for people is rendered beside it.
 *
 * Exit codes: 0 PASS; 1 FAIL on a gating run, or no verdict; 77 FAIL on an advisory run (the job fails, a pipeline that
 * allows 77 continues); 3 INCOMPLETE — no ERROR stands but a check was sampled or skipped, so the review cannot say what
 * it covered. Which runs gate is the run class's (`tier.ts`): `AUDIT_GATING`, or `--advisory`.
 */
import * as fs from 'node:fs';

import { readData } from './data';
import { THRESHOLDS, type Thresholds, thresholds, type Tier, tierOf as tierOfReading } from './severity';

const STATE = /^(PASS|FAIL|ADVISORY|INCOMPLETE)\S*/m;

/** A finding of a skill-driven review, as its report carries it. */
export type ReviewFinding = {
    readonly readerSeverity: number;
    readonly where: string;
    readonly detail: string;
    readonly readerConfidence: number;
    readonly fields?: Readonly<Record<string, string>>;
};
export type ReviewReport = {
    readonly title?: string;
    readonly findings: readonly ReviewFinding[];
    readonly coverage: { readonly complete: boolean; readonly notes?: string };
};

/** The tier a review finding stands at: its one reading, by the thresholds. */
export const tierOf = (f: ReviewFinding, t: Thresholds = THRESHOLDS): Tier =>
    tierOfReading({ severity: f.readerSeverity, confidence: f.readerConfidence }, t);

/**
 * A review report's verdict, from its findings and coverage alone: FAIL when an ERROR stands at a confidence above
 * `blocking`, ADVISORY when ERRORs stand and none is above it, INCOMPLETE when the coverage says so, PASS otherwise.
 */
export function reviewVerdict(
    report: ReviewReport,
    t: Thresholds = THRESHOLDS,
): { state: string; errors: number; warnings: number; line: string } {
    const tiers = report.findings.map((f) => tierOf(f, t));
    const errors = tiers.filter((tier) => tier === 'ERROR').length;
    const warnings = tiers.filter((tier) => tier === 'WARN').length;
    const blocking = report.findings.some((f) => tierOf(f, t) === 'ERROR' && f.readerConfidence > t.blocking);
    const state = blocking ? 'FAIL' : errors > 0 ? 'ADVISORY' : report.coverage.complete ? 'PASS' : 'INCOMPLETE';
    return { state, errors, warnings, line: `${state} (${errors} errors, ${warnings} warnings)` };
}

const cell = (s: string) =>
    String(s ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\|/g, '\\|');

/** The Markdown report for people: the verdict line first, then one table row per finding, the most severe first. */
export function renderReview(report: ReviewReport, t: Thresholds = THRESHOLDS): string {
    const v = reviewVerdict(report, t);
    const extra = [...new Set(report.findings.flatMap((f) => Object.keys(f.fields ?? {})))];
    const rows = [...report.findings].sort((a, b) => b.readerSeverity - a.readerSeverity);
    const out = [v.line, ''];
    if (report.title) out.push(`# ${report.title}`, '');
    if (rows.length) {
        out.push(
            `| Tier | Where | ${extra.map((k) => `${k} | `).join('')}What it does | Severity | Confidence |`,
            `| --- | --- | ${extra.map(() => '--- | ').join('')}--- | --- | --- |`,
            ...rows.map(
                (f) =>
                    `| ${tierOf(f, t)} | \`${cell(f.where)}\` | ${extra.map((k) => `${cell(f.fields?.[k] ?? '')} | `).join('')}${cell(f.detail)} | ${f.readerSeverity} | ${f.readerConfidence}% |`,
            ),
            '',
        );
    } else out.push('_No findings._', '');
    out.push('## Coverage', '', report.coverage.complete ? 'Complete.' : 'Not complete.', '');
    if (report.coverage.notes) out.push(report.coverage.notes.trim(), '');
    return out.join('\n');
}

/** The verdict a report states or earns, or null when it has none. */
export function verdictOf(file: string, text: string, t: Thresholds = THRESHOLDS): string | null {
    if (/\.ya?ml$/.test(file)) {
        const data = readData<{ verdict?: unknown } & Partial<ReviewReport>>(file);
        if (typeof data.verdict === 'string') return STATE.exec(data.verdict)?.[0] ?? null;
        return Array.isArray(data.findings) && data.coverage ? reviewVerdict(data as ReviewReport, t).state : null;
    }
    return STATE.exec(text)?.[0] ?? null;
}

/** The exit code a verdict carries: an ADVISORY verdict, or a FAIL on an advisory run, exits 77. */
export function exitFor(verdict: string | null, advisory: boolean): number {
    if (verdict?.startsWith('PASS')) return 0;
    if (verdict?.startsWith('INCOMPLETE')) return 3;
    if (verdict?.startsWith('ADVISORY')) return 77;
    if (verdict?.startsWith('FAIL')) return advisory ? 77 : 1;
    return 1;
}

/** `spec-tools verdict <report> [--advisory]`: a review report's Markdown is rendered beside it, then gated. */
export function gate(file: string, advisory: boolean, env: NodeJS.ProcessEnv = process.env): number {
    const t = thresholds(env);
    if (!fs.existsSync(file)) {
        console.error(`ERROR: ${file} was not written — the review did not complete.`);
        return 1;
    }
    if (/\.ya?ml$/.test(file)) {
        const data = readData<Partial<ReviewReport> & { verdict?: unknown }>(file);
        if (typeof data.verdict !== 'string' && Array.isArray(data.findings) && data.coverage)
            fs.writeFileSync(file.replace(/\.ya?ml$/, '.md'), renderReview(data as ReviewReport, t));
    }
    const verdict = verdictOf(file, fs.readFileSync(file, 'utf8'), t);
    if (!verdict) {
        console.error(`ERROR: no verdict (PASS / FAIL / INCOMPLETE) found in ${file}.`);
        return 1;
    }
    console.log(`verdict: ${verdict}`);
    const code = exitFor(verdict, advisory);
    if (code === 77)
        console.error(
            verdict.startsWith('ADVISORY')
                ? `ERROR findings in ${file}, none above ${t.blocking}% confidence: advisory — the job fails, the pipeline continues.`
                : `ERROR findings in ${file}; an advisory run: the job fails, the pipeline continues.`,
        );
    else if (code === 1) console.error(`ERROR findings in ${file} — see it in this job's artifacts.`);
    else if (code === 3)
        console.error(`INCOMPLETE: the review did not cover its whole scope — see the coverage in ${file}.`);
    return code;
}
