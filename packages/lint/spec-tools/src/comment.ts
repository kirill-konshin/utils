/**
 * `spec-tools comment <name>=<report.md>...`: the merge-request comment of a pipeline's AI reviews — one row per review
 * with its verdict and counts, read from the fixed first line every Markdown report carries (`PASS|FAIL|INCOMPLETE
 * (<n> errors, <m> warnings)`), linked to the reports in this job's artifacts, with the coverage report and the
 * specification diff beneath when the pipeline produced them. Written to `.spec-audit/mr-comment.md` and printed;
 * posting it is the pipeline's.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { pipeline } from './ci';
import { COMMENT_FILE, COVERAGE_REPORT, DIFF_FILE } from './files';

export { COMMENT_FILE };

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
    if (fs.existsSync(COVERAGE_REPORT)) out.push(`Coverage: ${reports(COVERAGE_REPORT.replace(/\.md$/, ''))}`, '');
    const diff = read(DIFF_FILE);
    if (diff !== undefined)
        out.push(`Specification diff — ${diff.split('\n')[0]}: ${reports(DIFF_FILE.replace(/\.md$/, ''))}`, '');
    const gating = env.AUDIT_GATING || 'gating';
    out.push(
        `This was ${gating === 'advisory' ? 'an advisory' : 'a gating'} run (${env.AUDIT_RUN || 'unknown'}, scope ${env.AUDIT_SCOPE || 'corpus'}, judged by ${env.AUDIT_MODEL_VERIFY || 'unknown'}). An ERROR is a demonstrated defect with a production effect that its judge confirmed with a confidence above 70%. ERROR findings fail a gating run and mark an advisory run failed without stopping the pipeline; an INCOMPLETE review — one that sampled or skipped a check — fails its job with exit code 3. WARN and INFO are published for triage.${id && url ? ` Pipeline [#${id}](${url}).` : ''}`,
    );
    const text = out.join('\n') + '\n';
    fs.mkdirSync(path.dirname(COMMENT_FILE), { recursive: true });
    fs.writeFileSync(COMMENT_FILE, text);
    return text;
}
