/**
 * `spec-tools run <skill> [--verdict <report.yaml>]`: one skill-driven AI review, headless — `claude --print "/<skill>"`
 * on the run class's model (`AUDIT_MODEL` / `AUDIT_EFFORT`, from `spec-tools tier`). The job log shows the
 * orchestrator's text and one timestamped line per tool call, sub-agents included (`↳`), so a long review is legible
 * while it runs; the whole stream is kept as `.spec-audit/claude.jsonl`, and the final result as the job log. When the
 * review names its report, the tool checks the report against its schema (`data.ts` `REVIEW_REPORT`) as soon as the
 * review stops, and sends the errors back to the same session to correct, at most `CORRECTIONS` times. Exits with
 * Claude's own status, the result echoed on a failure — e.g. an API usage-limit error.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { claudeSession, CORRECTIONS, correctUntilValid } from './claude';
import { checkFile, REVIEW_REPORT } from './data';
import { STREAM_FILE } from './files';
import { correction } from './rules';
import { CHEAP_EFFORT, CHEAP_MODEL } from './tier';

/** What a review may do: read, delegate to sub-agents, load skills, write its report — and the read-only git commands. */
export const REVIEW_TOOLS = 'Agent,Skill,Bash(git:git diff*|git log*|git show*),Read,Glob,Grep,Write';
export { CORRECTIONS, STREAM_FILE };

type Event = {
    type?: string;
    parent_tool_use_id?: string | null;
    event?: { type?: string; delta?: { text?: string } };
    message?: { content?: { type?: string; name?: string; input?: Record<string, unknown> }[] };
    result?: string;
    session_id?: string;
};

/** What one streamed event shows in the job log, or nothing. */
export function progress(event: Event, now = new Date()): string {
    if (event.type === 'stream_event' && event.event?.type === 'content_block_delta')
        return event.event.delta?.text ?? '';
    if (event.type !== 'assistant') return '';
    const clock = now.toTimeString().slice(0, 8);
    return (event.message?.content ?? [])
        .filter((c) => c.type === 'tool_use')
        .map((c) => {
            const i = c.input ?? {};
            const what =
                [i.description, i.file_path, i.pattern, i.command].find((v): v is string => typeof v === 'string') ??
                '';
            return `[${clock}]${event.parent_tool_use_id ? '   ↳' : ''} ${c.name} ${what.slice(0, 120)}\n`;
        })
        .join('');
}

/** One headless session, streamed to the job log; its exit code, its result text and its session id. */
async function session(
    prompt: string,
    env: NodeJS.ProcessEnv,
    resume?: string,
): Promise<{ code: number; result: string; id?: string }> {
    let result = '';
    let id: string | undefined;
    const { code } = await claudeSession({
        prompt,
        model: env.AUDIT_MODEL || CHEAP_MODEL,
        effort: env.AUDIT_EFFORT || CHEAP_EFFORT,
        tools: REVIEW_TOOLS,
        resume,
        flags: ['--include-partial-messages'],
        env,
        stream: STREAM_FILE,
        append: !!resume,
        onEvent: (raw) => {
            const event = raw as Event;
            if (event.type === 'result') {
                result = event.result ?? '';
                id = event.session_id ?? id;
            }
            process.stdout.write(progress(event));
        },
    });
    return { code, result, id: id ?? resume };
}

export async function run(
    skill: string,
    log: string,
    report?: string,
    env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
    let ran = await session(`/${skill}`, env);
    if (ran.code === 0 && report) {
        const checked = await correctUntilValid(
            ran,
            () => checkFile(report, REVIEW_REPORT),
            (r) => (r.code === 0 ? r.id : undefined),
            (errors, n, id) => {
                console.log(
                    `spec-tools run: ${report} has ${errors.length} error(s); correction ${n} of ${CORRECTIONS}`,
                );
                return session(correction(report, errors, false), env, id);
            },
        );
        ran = checked.ran;
        if (checked.errors.length)
            console.error(`spec-tools run: ${report} is still not valid:\n${checked.errors.join('\n')}`);
    }
    fs.mkdirSync(path.dirname(log), { recursive: true });
    fs.writeFileSync(log, ran.result ? `${ran.result}\n` : '');
    if (ran.code !== 0) console.error(`ERROR: claude exited ${ran.code}:\n${ran.result}`);
    return ran.code;
}
