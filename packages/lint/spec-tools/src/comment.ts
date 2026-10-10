/**
 * `spec-tools comment <name>=<report.md>...`: the merge-request comment of a pipeline's AI reviews — one row per review
 * with its verdict and counts, read from the fixed first line every report carries (`PASS|FAIL|INCOMPLETE (<n> errors,
 * <m> warnings)`), linked to the reports in this job's artifacts, with the coverage report and the specification diff
 * beneath when the pipeline produced them. Written to `mr-comment.md` and printed; posting it is the pipeline's.
 */
import * as fs from 'node:fs';

import { pipeline } from './ci';

export const COMMENT_FILE = 'mr-comment.md';

/** A report's verdict line: state and counts, or NOT RUN when the review produced no report. */
export function verdictRow(text: string | undefined): { state: string; errors: number; warnings: number } {
    if (text === undefined) return { state: 'NOT RUN', errors: 0, warnings: 0 };
    const line = text.split('\n')[0] ?? '';
    return {
        state: /^([A-Z]+)/.exec(line)?.[1] ?? 'UNKNOWN',
        errors: Number(/\((\d+) errors?/.exec(line)?.[1] ?? 0),
        warnings: Number(/(\d+) warnings?\)/.exec(line)?.[1] ?? 0),
    };
}

const MARKS: Record<string, string> = { PASS: '✅ OK', INCOMPLETE: '❌ Incomplete', FAIL: '❌ Failed' };

const read = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined);

export function comment(reviews: readonly string[], env: NodeJS.ProcessEnv = process.env): string {
    const { artifacts, id, url } = pipeline(env);
    const link = (file: string) => (artifacts ? `${artifacts}/${file}` : file);
    const reports = (stem: string) => `[md](${link(`${stem}.md`)}) · [html](${link(`${stem}.html`)})`;
    const out = [
        '## AI review',
        '',
        '| Review | Verdict | Errors | Warnings | Report |',
        '| --- | --- | --- | --- | --- |',
    ];
    for (const review of reviews) {
        const [name, file = `${review}.md`] = review.split('=');
        const v = verdictRow(read(file));
        out.push(
            `| ${name} | ${MARKS[v.state] ?? `⚠️ ${v.state}`} | ${v.errors} | ${v.warnings} | ${reports(file.replace(/\.md$/, ''))} |`,
        );
    }
    out.push('');
    // Coverage has no verdict by design: it reports bindings and gates nothing.
    if (fs.existsSync('spec-coverage.md')) out.push(`Coverage: ${reports('spec-coverage')}`, '');
    const diff = read('spec-diff.md');
    if (diff !== undefined) out.push(`Specification diff — ${diff.split('\n')[0]}: ${reports('spec-diff')}`, '');
    const gating = env.AUDIT_GATING || 'gating';
    out.push(
        `This was ${gating === 'advisory' ? 'an advisory' : 'a gating'} run (${env.AUDIT_RUN || 'unknown'}, scope ${env.AUDIT_SCOPE || 'corpus'}, judged by ${env.AUDIT_MODEL_VERIFY || 'unknown'}). ERROR findings fail a gating run and mark an advisory run failed without stopping the pipeline; an INCOMPLETE review — one that sampled or skipped a check — fails its job with exit code 3. WARN and INFO are published for triage.${id && url ? ` Pipeline [#${id}](${url}).` : ''}`,
    );
    const text = out.join('\n') + '\n';
    fs.writeFileSync(COMMENT_FILE, text);
    return text;
}
