/**
 * The verdict gate of an AI review. A headless `claude --print` exits 0 whether the review passed or found violations,
 * so the report's own verdict is the only signal that the REVIEW passed — without this a review job is a publisher, not
 * a gate. A Markdown report carries its verdict on its first line; a JSON report (`spec-verify.json`) as `.verdict`.
 *
 * A skill that prints its report and also writes it occasionally finishes the report in the conversation and skips
 * the write. The printed report is the same content by the skill's own contract, so when the file is missing but the
 * job log carries a graded verdict, the log IS the report: it is kept under the expected name with the verdict on the
 * first line, and gated as usual. A log with no verdict at all fails — that review did not complete.
 *
 * Exit codes: 0 PASS; 1 FAIL on a gating run, or no verdict; 77 FAIL on an advisory run (the job fails, a pipeline that
 * allows 77 continues); 3 INCOMPLETE — no ERROR stands but a check was sampled or skipped, so the review cannot say what
 * it covered. Which runs gate is the run class's (`tier.ts`): `AUDIT_GATING`, or `--advisory`.
 */
import * as fs from 'node:fs';

export const VERDICT_LINE = /(PASS|FAIL|INCOMPLETE) \(\d+ errors?, \d+ warnings?\)/;
const STATE = /^(PASS|FAIL|INCOMPLETE)\S*/m;

/** The verdict a report states, or null when it states none. */
export function verdictOf(file: string, text: string): string | null {
    if (file.endsWith('.json')) {
        const verdict = (JSON.parse(text) as { verdict?: unknown }).verdict;
        return typeof verdict === 'string' ? (STATE.exec(verdict)?.[0] ?? null) : null;
    }
    return STATE.exec(text)?.[0] ?? null;
}

/** The exit code a verdict carries. */
export function exitFor(verdict: string | null, advisory: boolean): number {
    if (verdict?.startsWith('PASS')) return 0;
    if (verdict?.startsWith('INCOMPLETE')) return 3;
    if (verdict?.startsWith('FAIL')) return advisory ? 77 : 1;
    return 1;
}

/** `spec-tools verdict <report> [--log <job log>] [--advisory]`. */
export function gate(file: string, log: string, advisory: boolean): number {
    if (!fs.existsSync(file)) {
        const recovered = fs.existsSync(log) ? VERDICT_LINE.exec(fs.readFileSync(log, 'utf8'))?.[0] : undefined;
        if (!recovered) {
            console.error(
                `ERROR: ${file} was not written and ${log} carries no verdict — the review did not complete.`,
            );
            return 1;
        }
        console.warn(`WARNING: ${file} was not written by the skill; recovering the report from ${log}.`);
        const note = '_Recovered from the streamed result: the skill printed its report but skipped the write._';
        fs.writeFileSync(file, `${recovered}\n\n${note}\n\n${fs.readFileSync(log, 'utf8')}`);
    }
    const verdict = verdictOf(file, fs.readFileSync(file, 'utf8'));
    if (!verdict) {
        console.error(`ERROR: no verdict line (PASS / FAIL / INCOMPLETE) found in ${file}.`);
        return 1;
    }
    console.log(`verdict: ${verdict}`);
    const code = exitFor(verdict, advisory);
    if (code === 77)
        console.error(`ERROR findings in ${file}; an advisory run: the job fails, the pipeline continues.`);
    else if (code === 1) console.error(`ERROR findings in ${file} — see it in this job's artifacts.`);
    else if (code === 3)
        console.error(`INCOMPLETE: the review did not cover its whole scope — see the coverage in ${file}.`);
    return code;
}
