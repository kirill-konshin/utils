/**
 * One headless `claude --print` session, the engine under `spec-tools run` and the audit's workers: the command line,
 * the streamed events kept in a file, the last `result` event, and the exit code — 127 when `claude` cannot start. A
 * file the session must write is checked as soon as it stops, and its errors go back to the same session
 * (`correctUntilValid`).
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** A streamed event: what `claude --output-format stream-json` writes, one per line. */
export type ClaudeEvent = Record<string, unknown>;

export type SessionOptions = {
    readonly prompt: string;
    readonly model: string;
    readonly effort: string;
    readonly tools: string;
    /** A session to continue rather than start: a correction goes back to the session that wrote the file. */
    readonly resume?: string;
    /** The caller's own flags, after `--effort`. */
    readonly flags?: readonly string[];
    readonly env: NodeJS.ProcessEnv;
    readonly cwd?: string;
    /** Where the stream is kept. */
    readonly stream: string;
    /** Add to the stream file instead of starting it again. */
    readonly append?: boolean;
    /** Where `claude`'s stderr goes; this process's own stderr when not given. */
    readonly stderr?: string;
    /** Past this many milliseconds the session is killed. */
    readonly budget?: number;
    /** Every event, as it arrives. */
    readonly onEvent?: (event: ClaudeEvent) => void;
};

export type Session = {
    readonly code: number;
    readonly killed: boolean;
    /** The last `result` event, or undefined when the session wrote none. */
    readonly result?: ClaudeEvent;
};

/** How many times a file that fails its schema goes back to the session that wrote it. */
export const CORRECTIONS = 2;

/** The command line of one session: `--resume` and `--print` first, then the model, the caller's flags, the stream. */
export const claudeArgs = ({ prompt, model, effort, tools, resume, flags = [] }: SessionOptions): string[] => [
    ...(resume ? ['--resume', resume] : []),
    '--print',
    prompt,
    '--model',
    model,
    '--effort',
    effort,
    ...flags,
    '--output-format',
    'stream-json',
    '--verbose',
    '--allowedTools',
    tools,
];

/** One headless session: its exit code, whether its budget killed it, and its last `result` event. */
export async function claudeSession(o: SessionOptions): Promise<Session> {
    fs.mkdirSync(path.dirname(o.stream), { recursive: true });
    const stream = fs.createWriteStream(o.stream, { flags: o.append ? 'a' : 'w' });
    const errFd = o.stderr === undefined ? undefined : fs.openSync(o.stderr, 'w');
    const child = spawn('claude', claudeArgs(o), {
        cwd: o.cwd,
        env: o.env,
        stdio: ['ignore', 'pipe', errFd ?? 'inherit'],
    });
    let result: ClaudeEvent | undefined;
    let pending = '';
    const parse = (line: string) => {
        let event: unknown;
        try {
            event = JSON.parse(line);
        } catch {
            return; // not an event, or a partial line
        }
        if (typeof event !== 'object' || event === null) return;
        if ((event as ClaudeEvent).type === 'result') result = event as ClaudeEvent;
        o.onEvent?.(event as ClaudeEvent);
    };
    child.stdout?.on('data', (chunk: Buffer) => {
        stream.write(chunk);
        const lines = (pending + chunk.toString('utf8')).split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) parse(line);
    });
    let killed = false;
    const timer =
        o.budget === undefined
            ? undefined
            : setTimeout(() => {
                  killed = true;
                  child.kill('SIGTERM');
              }, o.budget);
    const code = await new Promise<number>((resolve) => {
        child.on('error', () => resolve(127));
        child.on('close', (c) => resolve(c ?? 1));
    });
    clearTimeout(timer);
    if (pending) parse(pending);
    await new Promise<void>((resolve) => stream.end(resolve));
    if (errFd !== undefined) fs.closeSync(errFd);
    return { code, killed, result };
}

/**
 * The file a session wrote, checked; while it fails and the last session can take a correction, its errors go back to
 * that session, at most `CORRECTIONS` times. Returns the last session's outcome, the errors that remain and how many
 * corrections it took.
 *
 * @param resumable the session id of a run that finished and can be sent a correction, or undefined
 * @param correct sends correction `n` to `session`
 */
export async function correctUntilValid<R>(
    first: R,
    check: () => string[],
    resumable: (ran: R) => string | undefined,
    correct: (errors: string[], n: number, session: string) => Promise<R>,
): Promise<{ ran: R; errors: string[]; corrections: number }> {
    let ran = first;
    let errors = check();
    let corrections = 0;
    let session = resumable(ran);
    while (errors.length && session && corrections < CORRECTIONS) {
        corrections++;
        ran = await correct(errors, corrections, session);
        errors = check();
        session = resumable(ran);
    }
    return { ran, errors, corrections };
}
