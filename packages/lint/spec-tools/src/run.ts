/**
 * `spec-tools run <skill> [--verdict <report.yaml>]`: one skill-driven AI review, headless — `claude --print "/<skill>"`
 * on the run class's model (`AUDIT_MODEL` / `AUDIT_EFFORT`, from `spec-tools tier`). The job log shows the
 * orchestrator's text and one timestamped line per tool call, sub-agents included (`↳`), so a long review is legible
 * while it runs; the whole stream is kept as `.spec-audit/claude.jsonl`, and the final result as the job log. When the
 * review names its report, the tool checks the report against its schema (`data.ts` `REVIEW_REPORT`) as soon as the
 * review stops, and sends the errors back to the same session to correct, at most `CORRECTIONS` times. Exits with
 * Claude's own status, the result echoed on a failure — e.g. an API usage-limit error.
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { checkFile, REVIEW_REPORT } from './data';
import { STREAM_FILE } from './files';
import { correction } from './rules';
import { CHEAP_EFFORT, CHEAP_MODEL } from './tier';

/** What a review may do: read, delegate to sub-agents, load skills, write its report — and the read-only git commands. */
export const REVIEW_TOOLS = 'Agent,Skill,Bash(git:git diff*|git log*|git show*),Read,Glob,Grep,Write';
export { STREAM_FILE };
/** How many times a report that fails its schema goes back to the review. */
export const CORRECTIONS = 2;

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
            const what = String(i.description ?? i.file_path ?? i.pattern ?? i.command ?? '').slice(0, 120);
            return `[${clock}]${event.parent_tool_use_id ? '   ↳' : ''} ${c.name} ${what}\n`;
        })
        .join('');
}

/** One headless session, streamed to the job log; its exit code, its result text and its session id. */
async function session(
    prompt: string,
    env: NodeJS.ProcessEnv,
    resume?: string,
): Promise<{ code: number; result: string; id?: string }> {
    const args = [
        ...(resume ? ['--resume', resume] : []),
        '--print',
        prompt,
        '--model',
        env.AUDIT_MODEL || CHEAP_MODEL,
        '--effort',
        env.AUDIT_EFFORT || CHEAP_EFFORT,
        '--output-format',
        'stream-json',
        '--verbose',
        '--include-partial-messages',
        '--allowedTools',
        REVIEW_TOOLS,
    ];
    fs.mkdirSync(path.dirname(STREAM_FILE), { recursive: true });
    const stream = fs.createWriteStream(STREAM_FILE, { flags: resume ? 'a' : 'w' });
    const child = spawn('claude', args, { env, stdio: ['ignore', 'pipe', 'inherit'] });
    let result = '';
    let id: string | undefined;
    let pending = '';
    child.stdout.on('data', (chunk: Buffer) => {
        stream.write(chunk);
        const lines = (pending + chunk.toString('utf8')).split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) {
            try {
                const event = JSON.parse(line) as Event;
                if (event.type === 'result') {
                    result = event.result ?? '';
                    id = event.session_id ?? id;
                }
                process.stdout.write(progress(event));
            } catch {
                // not an event
            }
        }
    });
    const code = await new Promise<number>((resolve) => {
        child.on('error', () => resolve(127));
        child.on('close', (c) => resolve(c ?? 1));
    });
    await new Promise<void>((resolve) => stream.end(resolve));
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
        let errors = checkFile(report, REVIEW_REPORT);
        for (let n = 1; errors.length && ran.code === 0 && ran.id && n <= CORRECTIONS; n++) {
            console.log(`spec-tools run: ${report} has ${errors.length} error(s); correction ${n} of ${CORRECTIONS}`);
            ran = await session(correction(report, errors, false), env, ran.id);
            errors = checkFile(report, REVIEW_REPORT);
        }
        if (errors.length) console.error(`spec-tools run: ${report} is still not valid:\n${errors.join('\n')}`);
    }
    fs.mkdirSync(path.dirname(log), { recursive: true });
    fs.writeFileSync(log, ran.result ? `${ran.result}\n` : '');
    if (ran.code !== 0) console.error(`ERROR: claude exited ${ran.code}:\n${ran.result}`);
    return ran.code;
}
