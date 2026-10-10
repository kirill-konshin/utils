/**
 * `spec-tools run <skill>`: one skill-driven AI review, headless — `claude --print "/<skill>"` on the run class's model
 * (`AUDIT_MODEL` / `AUDIT_EFFORT`, from `spec-tools tier`). The job log shows the orchestrator's text and one
 * timestamped line per tool call, sub-agents included (`↳`), so a long review is legible while it runs; the whole
 * stream is kept as `claude.jsonl`, and the final result as the job log the verdict gate recovers from. Exits with
 * Claude's own status, the result echoed on a failure — e.g. an API usage-limit error.
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';

import { CHEAP_EFFORT, CHEAP_MODEL } from './tier';

/** What a review may do: read, delegate to sub-agents, load skills, write its report — and the read-only git commands. */
export const REVIEW_TOOLS = 'Agent,Skill,Bash(git:git diff*|git log*|git show*),Read,Glob,Grep,Write';
export const STREAM_FILE = 'claude.jsonl';

type Event = {
    type?: string;
    parent_tool_use_id?: string | null;
    event?: { type?: string; delta?: { text?: string } };
    message?: { content?: { type?: string; name?: string; input?: Record<string, unknown> }[] };
    result?: string;
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

export async function run(skill: string, log: string, env: NodeJS.ProcessEnv = process.env): Promise<number> {
    const args = [
        '--print',
        `/${skill}`,
        '--model',
        env.AUDIT_MODEL || CHEAP_MODEL,
        '--effort',
        env.AUDIT_EFFORT || CHEAP_EFFORT,
    ];
    args.push(
        '--output-format',
        'stream-json',
        '--verbose',
        '--include-partial-messages',
        '--allowedTools',
        REVIEW_TOOLS,
    );
    const stream = fs.createWriteStream(STREAM_FILE);
    const child = spawn('claude', args, { env, stdio: ['ignore', 'pipe', 'inherit'] });
    let result = '';
    let pending = '';
    child.stdout.on('data', (chunk: Buffer) => {
        stream.write(chunk);
        const lines = (pending + chunk.toString('utf8')).split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) {
            try {
                const event = JSON.parse(line) as Event;
                if (event.type === 'result') result = event.result ?? '';
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
    fs.writeFileSync(log, result ? `${result}\n` : '');
    if (code !== 0) console.error(`ERROR: claude exited ${code}:\n${result}`);
    return code;
}
