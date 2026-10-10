/**
 * The specification audit's fan-out, deterministic: headless `claude --print` workers started from here — no
 * orchestrating model decides when or whether the next worker starts. Each reader loads the `spec-verify` skill and its
 * judging rules (`skills/spec-tools/references/rules/`), and writes its own findings file; `spec-tools report` merges
 * after every pass. CI runs the passes in one job or the reading in parallel jobs and the rest in a judge job — the
 * hand-off is files either way — and `spec-tools audit` runs them locally, in this order:
 *
 *   1. reading      One worker per part of `.spec-audit/scope.yaml`, judging every check over every requirement of its
 *                   part; the scope cut one part per slot of every reading job, so the reading is one round. In a
 *                   parallel job (`ci.ts` `shard`) only the job's share: part p goes to job ((p - 1) mod total) + 1, so
 *                   each job works its share out from the scope alone. Then the merge.
 *   2. complete     One worker per part the merge left short — the `short` list of `.spec-audit/spec-verify.yaml` — over
 *                   exactly those items, writing the part's next reader file. Nothing already judged is judged twice.
 *   3. verify       One judge per ERROR the merge left standing, over that finding alone, confirming it or lowering it to
 *                   WARN, with its confidence, on AUDIT_MODEL_VERIFY. Then the last merge, whose verdict gates.
 *
 * A worker writes its findings file and nothing else. The tool checks that file against its schema as soon as the
 * worker stops (`data.ts`), and sends the errors back to the same worker session to correct, at most `CORRECTIONS`
 * times. Every pass compares the tree it leaves with the tree it found — each changed or untracked file with its
 * content's hash — and fails, exit 1, naming the paths, when anything changed outside the audit's own folder
 * (`.spec-audit/`).
 *
 * Models, efforts and gating are the run class's (`tier.ts`); how many parts there are is the evidence's
 * (`auditScope.ts`), and how many run at once is memory's, below.
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { Finding, ShortPart } from './auditReport';
import type { Part, ScopeData } from './auditScope';
import { shard } from './ci';
import {
    checkFile,
    JUDGE_VERDICT,
    readData,
    READER_FINDINGS,
    type Schema,
    STEWARD_FINDINGS,
    STEWARD_VERDICT,
    toYaml,
    tryReadData,
    writeData,
} from './data';
import { AUDIT_DIR, AUDIT_FILES, type AuditFiles, type AuditName, findingsFile, verdictFile } from './files';
import { git, root } from './repo';
import { correction, KEY_STYLE, readRules, rulesText } from './rules';
import { SKILLS_DIR } from './skillsDir';
import * as steward from './stewardAudit';
import { CHEAP_EFFORT, CHEAP_MODEL, EXPENSIVE_MODEL, workersFor } from './tier';

export type Pass = 'read' | 'complete' | 'verify';

type Options = {
    readonly audit?: AuditName;
    /** Facts established and decisions the owner already made, put into every brief of the run (`--context <file>`). */
    readonly context?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly cwd?: string;
    readonly log?: (line: string) => void;
};

/** The tools a worker may use; every other command is denied in a headless run and only costs a turn. */
export const TOOLS = 'Skill,Bash(git:git diff*|git log*|git show*),Read,Glob,Grep,Write,Edit';
/** A corpus-quality worker reads and writes its findings file; it never edits one. */
const STEWARD_TOOLS = 'Skill,Bash(git:git diff*|git log*|git show*),Read,Glob,Grep,Write';
/** What a pass may leave behind besides nothing: the audit's own folder. */
const OUTPUTS = new RegExp(`^${AUDIT_DIR.replace('.', '\\.')}/`);
/** How many times a file that fails its schema goes back to its worker before the worker counts as not run. */
export const CORRECTIONS = 2;
/** A worker that exits non-zero this soon, with no file written, failed to start — e.g. "Not logged in" when many sessions start at once. */
export const EARLY_FAILURE_MS = 60_000;
/** How long such a worker waits before its one retry. */
const RETRY_DELAY_MS = 3_000;

/** How many workers run at once: in a container `tier`'s workersFor its memory; elsewhere AUDIT_WORKERS, else all. */
export function concurrency(env: NodeJS.ProcessEnv, memoryLimit = cgroupLimit()): number {
    return memoryLimit === null ? Number(env.AUDIT_WORKERS) || 0 : workersFor(env, memoryLimit); // 0: every task at once
}

const cgroupLimit = (): number | null =>
    cgroupBytes(['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']);
const cgroupPeak = (): number | null =>
    cgroupBytes(['/sys/fs/cgroup/memory.peak', '/sys/fs/cgroup/memory/memory.max_usage_in_bytes']);

const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(2)} GB`;
/** The container's memory as the pass used it, for the job log — what WORKER_BYTES and AUDIT_WORKERS are tuned from. */
export const memoryLine = (limit = cgroupLimit(), peak = cgroupPeak()): string | undefined =>
    limit === null ? undefined : `memory: peak ${peak === null ? 'unknown' : gb(peak)} of a ${gb(limit)} limit`;

function cgroupBytes(files: readonly string[]): number | null {
    for (const file of files) {
        let value: string;
        try {
            value = fs.readFileSync(file, 'utf8').trim();
        } catch {
            continue;
        }
        if (value === 'max') return null;
        const bytes = Number(value);
        if (Number.isFinite(bytes) && bytes < 1e15) return bytes;
    }
    return null;
}

/** The parts dealt to job `index` of `total` in turn. */
export const shareOf = (parts: readonly Part[], { index, total }: { index: number; total: number }): Part[] =>
    parts.filter((p) => (p.part - 1) % total === index - 1);

/** The tree as git sees it beyond HEAD: every changed or untracked file with its content's hash. */
export function treeState(cwd: string): Map<string, string> {
    const state = new Map<string, string>();
    for (const file of git(['ls-files', '--modified', '--others', '--exclude-standard', '-z'], cwd).split('\0')) {
        if (!file) continue;
        const full = path.join(cwd, file);
        const stat = fs.lstatSync(full, { throwIfNoEntry: false });
        state.set(
            file,
            !stat ? 'deleted' : stat.isFile() ? git(['hash-object', '--no-filters', '--', file], cwd).trim() : 'other',
        );
    }
    return state;
}

/** The paths whose state differs between two snapshots, the audit's own outputs aside. */
export function treeChanges(before: Map<string, string>, after: Map<string, string>): string[] {
    const paths = new Set([...before.keys(), ...after.keys()]);
    return [...paths].filter((p) => before.get(p) !== after.get(p) && !OUTPUTS.test(p)).sort();
}

const TOOL_RULE =
    'Tool rule: use only Skill, Read, Glob, Grep, Write, Edit and the git commands. Other commands are denied here and only cost a turn.';
/** The shipped skill, two levels above this module in the source and in the build alike. */
const SKILL = path.join(SKILLS_DIR, 'spec-verify/SKILL.md');
/** Loading the skill: by name where the repository links it, else from the package — a job with no install links none. */
const loadSkill = (repo: string) =>
    `First, load the skill: use the Skill tool with skill "spec-verify" (or Read ${path.relative(repo, SKILL)} if that fails). ${readRules(repo, 'spec-verify')}`;

/** The reading brief: one part, every check over every requirement of it. */
export const brief = (p: Part, repo: string): string => `You are a reader for the spec-verify audit in repo ${repo}.

${loadSkill(repo)}

Your assignment:
- part: ${p.part}
- reader: 1
- capabilities: ${p.capabilities.join(', ')}
- findings file to write (Write tool, overwrite, nothing else): ${p.findings[0]}
- evidence files: ${p.files.join(', ')}
- requirementIds (your judged list names exactly these):
${p.requirementIds.join('\n')}

Judge checks 1–5 over every requirement of the part. ${TOOL_RULE}

${KEY_STYLE}

Write the findings file at the path above. Then return one line: the path and your counts per tier.
`;

/**
 * The completion brief: the same contract, over exactly what the first pass left. A check the first pass left short is
 * judged over the requirements its note names, or over the whole part when it names none; a requirement no judged
 * list names is judged for checks 1–5.
 */
export const briefComplete = (p: Part, short: ShortPart, reader: number, file: string, repo: string): string => {
    const ids = short.requirementIds.length ? short.requirementIds.join('\n') : '(none)';
    const checks = Object.entries(short.checks);
    return `You are a completion reader for the spec-verify audit in repo ${repo}. The first pass over part ${p.part} did not finish. Judge only what it left. The rest of the part is already judged.

${loadSkill(repo)}

Your assignment:
- part: ${p.part}
- reader: ${reader}
- capabilities: ${p.capabilities.join(', ')}
- findings file to write (Write tool, overwrite, nothing else): ${file}
- evidence files: ${p.files.join(', ')}
- requirements the first pass did not judge — judge checks 1–5 over each:
${ids}
- checks the first pass left short, with its note — judge each over the requirements the note names, or over every requirement of the part when it names none:
${checks.length ? checks.map(([check, note]) => `  ${check}: ${note}`).join('\n') : '  (none)'}

The coverage map names only the checks this brief names. The judged list names only the requirement ids you judged here. ${TOOL_RULE}

${KEY_STYLE}

Write the findings file at the path above. Then return one line: the path and your counts per tier.
`;
};

/** The judge's brief: one finding, one question, its rules inlined — the judge loads no skill. */
export const briefVerify = (f: Finding, p: Part | undefined, file: string, repo: string): string => {
    const { kind, where, detail, readerConfidence, quotes } = f;
    return `You are the judge for ONE finding of the spec-verify audit in repo ${repo}. The reader graded it ERROR, and the tool found its quotes at their lines.

These are your judging rules.

${rulesText('common')}

${rulesText('spec-verify')}

${rulesText('spec-verify-judge')}

The finding:
${toYaml({ kind, where, detail, readerConfidence, quotes })}
Read, with the Read and Grep tools only: the requirement's block in the part's evidence files (${p?.files.join(', ') ?? `${AUDIT_DIR}/parts/`}), the quoted sources and the code near them. Other commands are denied and only cost a turn.

Write this YAML to ${file} with the Write tool, and nothing else:
verdict: "confirmed" or "warn"
reason: |
  for confirmed, the production effect; for warn, the statement that is not true
scenario: |
  only when confirmed: the production scenario in one sentence
judgeConfidence: an integer from 0 to 100

${KEY_STYLE}

Then return one line: the path and the verdict.
`;
};

/** `20m`, `90s`, `1h` or bare seconds, in milliseconds. */
export function duration(text: string): number {
    const m = /^(\d+(?:\.\d+)?)([smh]?)$/.exec(text.trim());
    if (!m) throw new Error(`bad duration: ${text}`);
    return Number(m[1]) * { '': 1000, s: 1000, m: 60_000, h: 3_600_000 }[m[2] as '' | 's' | 'm' | 'h'];
}

/** The last `result` event of a worker's stream, or undefined when it wrote none. */
function resultOf(jsonl: string): Record<string, unknown> | undefined {
    if (!fs.existsSync(jsonl)) return undefined;
    let result: Record<string, unknown> | undefined;
    for (const line of fs.readFileSync(jsonl, 'utf8').split('\n')) {
        try {
            const event = JSON.parse(line) as Record<string, unknown>;
            if (event.type === 'result') result = event;
        } catch {
            // a partial line
        }
    }
    return result;
}

type Run = {
    readonly prompt: string;
    readonly model: string;
    readonly effort: string;
    readonly log: string;
    readonly dir: string;
    readonly tools: string;
    /** A session to continue rather than start: a correction goes back to the worker that wrote the file. */
    readonly resume?: string;
};

/** How one worker run ended, and the session to send a correction to. */
type Ran = { readonly status: string; readonly session?: string };

/** One thing the verification pass puts to a judge: a label for the log, and its brief. */
type Target = { readonly label: string; readonly brief: (file: string, repo: string) => string };

/** What differs between the audits the engine runs: their files, tools, default model, briefs, schemas and targets. */
type Kind = {
    readonly files: AuditFiles;
    readonly tools: string;
    readonly canEdit: boolean;
    readonly model: string;
    readonly effort: string;
    readonly brief: (p: Part, repo: string) => string;
    readonly briefComplete: (p: Part, short: ShortPart, reader: number, file: string, repo: string) => string;
    readonly findingsSchema: Schema;
    readonly verdictSchema: Schema;
    readonly targets: (data: never, partOf: (n: number) => Part | undefined) => Target[];
    readonly none: string;
};

const KINDS: Record<AuditName, Kind> = {
    'spec-verify': {
        files: AUDIT_FILES['spec-verify'],
        tools: TOOLS,
        canEdit: true,
        model: CHEAP_MODEL,
        effort: CHEAP_EFFORT,
        brief,
        briefComplete,
        findingsSchema: READER_FINDINGS,
        verdictSchema: JUDGE_VERDICT,
        targets: (data: { findings: (Finding & { part?: number })[] }, partOf) =>
            data.findings
                .filter((f) => f.tier === 'ERROR')
                .map((f) => ({
                    label: f.where,
                    brief: (file, repo) => briefVerify(f, partOf(f.part ?? 1), file, repo),
                })),
        none: 'no ERROR stands',
    },
    'spec-steward': {
        files: AUDIT_FILES['spec-steward'],
        tools: STEWARD_TOOLS,
        canEdit: false,
        model: EXPENSIVE_MODEL,
        effort: 'high',
        brief: steward.brief,
        briefComplete: steward.briefComplete,
        findingsSchema: STEWARD_FINDINGS,
        verdictSchema: STEWARD_VERDICT,
        targets: (data: steward.StewardData) =>
            data.candidates.map((c) => ({
                label: `${c.file}:${c.line}`,
                brief: (file, repo) => steward.briefVerify(c, file, repo),
            })),
        none: 'no finding stands',
    },
};

/**
 * One headless worker under its time budget. A worker that never returns must not hold the whole job to its timeout:
 * past the budget it is killed and writes no findings file; the merge lists its part as short, and the completion pass
 * judges it once. A finished worker keeps its result event alone (duration, turns, cost, usage); a failed one keeps its
 * whole stream, and its own reason — e.g. an API usage-limit error — is echoed next to the exit status. The session id
 * is kept either way, so a file that fails its check can go back to the same session.
 */
async function runClaude(
    run: Run,
    wrote: () => boolean,
    budget: number,
    env: NodeJS.ProcessEnv,
    cwd: string,
): Promise<Ran> {
    const jsonl = path.join(cwd, run.dir, `${run.log}.jsonl`);
    const err = path.join(cwd, run.dir, `${run.log}.err`);
    const args = [
        ...(run.resume ? ['--resume', run.resume] : []),
        '--print',
        run.prompt,
        '--model',
        run.model,
        '--effort',
        run.effort,
        '--permission-mode',
        'default',
    ];
    args.push('--output-format', 'stream-json', '--verbose', '--allowedTools', run.tools);
    const out = fs.openSync(jsonl, 'w');
    const errOut = fs.openSync(err, 'w');
    const child = spawn('claude', args, { cwd, env, stdio: ['ignore', out, errOut] });
    let killed = false;
    const timer = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
    }, budget);
    const code = await new Promise<number>((resolve) => {
        child.on('error', () => resolve(127));
        child.on('close', (c) => resolve(c ?? 1));
    });
    clearTimeout(timer);
    fs.closeSync(out);
    fs.closeSync(errOut);
    const r = resultOf(jsonl);
    const session = typeof r?.session_id === 'string' ? r.session_id : run.resume;
    if (killed) return { status: `killed after ${Math.round(budget / 60_000)}m`, session };
    if (code !== 0) {
        const why = String(r?.result ?? '').slice(0, 200);
        return { status: `exit ${code}${why ? ` (${why})` : ''}`, session };
    }
    if (wrote()) {
        if (r)
            writeData(jsonl.replace(/\.jsonl$/, '.result.yaml'), {
                subtype: r.subtype,
                is_error: r.is_error,
                duration_ms: r.duration_ms,
                num_turns: r.num_turns,
                total_cost_usd: r.total_cost_usd,
                usage: r.usage,
                session_id: session,
            });
        fs.rmSync(jsonl);
        if (fs.statSync(err).size === 0) fs.rmSync(err);
    }
    return { status: 'ok', session };
}

/**
 * One worker, retried once at once when it failed to start: a non-zero exit within `EARLY_FAILURE_MS` that wrote
 * nothing. Without the retry its part waits for the completion pass, after the whole reading.
 */
async function runOnce(
    run: Run,
    wrote: () => boolean,
    budget: number,
    env: NodeJS.ProcessEnv,
    cwd: string,
): Promise<Ran & { retried: boolean }> {
    const started = Date.now();
    const first = await runClaude(run, wrote, budget, env, cwd);
    if (!first.status.startsWith('exit ') || wrote() || Date.now() - started > EARLY_FAILURE_MS)
        return { ...first, retried: false };
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return { ...(await runClaude({ ...run, log: `${run.log}-retry` }, wrote, budget, env, cwd)), retried: true };
}

/**
 * The file a worker wrote, checked against its schema; while it fails and the worker finished, its errors go back to
 * the same session, at most `CORRECTIONS` times. Returns the errors that remain and how many corrections it took.
 */
async function checked(
    run: Run,
    first: Ran,
    file: string,
    schema: Schema,
    canEdit: boolean,
    budget: number,
    env: NodeJS.ProcessEnv,
    cwd: string,
): Promise<{ status: string; errors: string[]; corrections: number }> {
    const full = path.join(cwd, file);
    let ran = first;
    let errors = checkFile(full, schema);
    let corrections = 0;
    while (errors.length && ran.status === 'ok' && ran.session && corrections < CORRECTIONS) {
        corrections++;
        ran = await runClaude(
            {
                ...run,
                prompt: correction(file, errors, canEdit),
                resume: ran.session,
                log: `${run.log}-fix-${corrections}`,
            },
            () => fs.existsSync(full),
            budget,
            env,
            cwd,
        );
        errors = checkFile(full, schema);
    }
    return { status: ran.status, errors, corrections };
}

/** Run tasks with at most `limit` at once (0: all at once). */
async function pool(tasks: readonly (() => Promise<void>)[], limit: number): Promise<void> {
    const queue = [...tasks];
    const lanes = Array.from({ length: limit > 0 ? Math.min(limit, queue.length) : queue.length }, async () => {
        for (let task = queue.shift(); task; task = queue.shift()) await task();
    });
    await Promise.all(lanes);
}

const clock = () => new Date().toTimeString().slice(0, 8);

/** The end of a worker's log line: a retry, corrections, and the first error that remains. */
const checkNote = ({ errors, corrections }: { errors: readonly string[]; corrections: number }, retried = false) =>
    `${retried ? ', retried after a failed start' : ''}${corrections ? `, corrected ${corrections}×` : ''}${errors.length ? `, still invalid: ${errors[0]}` : ''}`;

/** One pass of the audit's workers; the exit code: 0 done, 1 the tree changed, 2 an input is missing. */
export async function workers(
    pass: Pass,
    { audit = 'spec-verify', context, env = process.env, cwd = root(), log = console.log }: Options = {},
) {
    const withContext = (prompt: string) =>
        context?.trim()
            ? `${prompt}\nRun context — facts established and decisions the owner has already made. Judge with them. A finding or a verdict that reverses one says so:\n${context.trim()}\n`
            : prompt;
    const kind = KINDS[audit];
    const { files } = kind;
    const flag = audit === 'spec-verify' ? '' : ` --audit ${audit}`;
    const fail = (message: string) => {
        console.error(`spec-tools workers: ${message}`);
        return 2;
    };
    const scopePath = path.join(cwd, files.scope);
    if (!fs.existsSync(scopePath)) return fail(`${files.scope} is missing — run spec-tools scope${flag} first`);
    const scope = readData<ScopeData>(scopePath);
    const model = env.AUDIT_MODEL || kind.model;
    const effort = env.AUDIT_EFFORT || kind.effort;
    const budget = duration(env.AUDIT_WORKER_TIMEOUT || '20m');
    const limit = concurrency(env);
    /** One pass's workers, `limit` at a time, then the memory they used. */
    const runPass = async (tasks: readonly (() => Promise<void>)[]) => {
        await pool(tasks, limit);
        const memory = memoryLine();
        if (memory) log(`spec-tools workers: ${memory}, ${limit} at a time`);
    };
    const findings = path.join(cwd, files.findings);
    fs.mkdirSync(findings, { recursive: true });
    const before = treeState(cwd);
    const partOf = (n: number) => scope.parts.find((p) => p.part === n);
    const repo = cwd;

    const work = async (p: Part, short?: ShortPart) => {
        // The completion worker is the part's next reader: one more findings file, never an overwrite.
        const reader = short
            ? fs.readdirSync(findings).filter((f) => new RegExp(`^part-${p.part}-\\d+\\.yaml$`).test(f)).length + 1
            : 1;
        const file = short ? findingsFile(p.part, reader, audit) : p.findings[0]!;
        const prompt = withContext(short ? kind.briefComplete(p, short, reader, file, repo) : kind.brief(p, repo));
        const started = Date.now();
        log(`[${clock()}] worker ${p.part} started — ${short ? `completion, reader ${reader}, ` : ''}${model}`);
        const run: Run = {
            prompt,
            model,
            effort,
            log: short ? `worker-${p.part}-${reader}` : `worker-${p.part}`,
            dir: files.findings,
            tools: kind.tools,
        };
        const full = path.join(cwd, file);
        const first = await runOnce(run, () => fs.existsSync(full), budget, env, cwd);
        const check = await checked(run, first, file, kind.findingsSchema, kind.canEdit, budget, env, cwd);
        const data = check.errors.length ? undefined : tryReadData<{ findings?: unknown[]; judged?: unknown[] }>(full);
        const wrote = data
            ? `${data.findings?.length ?? 0} findings, judged ${data.judged?.length ?? 0}`
            : fs.existsSync(full)
              ? 'invalid findings file'
              : 'no findings file';
        log(
            `[${clock()}] worker ${p.part} finished in ${Math.round((Date.now() - started) / 1000)}s — ${check.status} — ${wrote}${checkNote(check, first.retried)}`,
        );
    };

    const verify = async (target: Target, k: number) => {
        const file = verdictFile(k, audit);
        const full = path.join(cwd, file);
        const started = Date.now();
        log(`[${clock()}] verifier ${k} started — ${target.label}`);
        const run: Run = {
            prompt: withContext(target.brief(file, repo)),
            model: env.AUDIT_MODEL_VERIFY || model,
            effort: env.AUDIT_EFFORT_VERIFY || effort,
            log: `verifier-${k}`,
            dir: files.findings,
            tools: kind.tools,
        };
        const first = await runOnce(run, () => fs.existsSync(full), budget, env, cwd);
        const check = await checked(run, first, file, kind.verdictSchema, kind.canEdit, budget, env, cwd);
        const v = check.errors.length
            ? undefined
            : tryReadData<{ verdict: string; reason: string; judgeConfidence?: number }>(full);
        const wrote = v
            ? `${v.verdict}${v.judgeConfidence !== undefined ? ` (${v.judgeConfidence}%)` : ''} — ${String(v.reason).trim()}`
            : fs.existsSync(full)
              ? 'invalid verdict file'
              : 'no verdict file';
        log(
            `[${clock()}] verifier ${k} finished in ${Math.round((Date.now() - started) / 1000)}s — ${check.status} — ${wrote}${checkNote(check, first.retried)}`,
        );
    };

    const unchanged = (): number => {
        const changed = treeChanges(before, treeState(cwd));
        if (!changed.length) return 0;
        console.error(
            "spec-tools workers: the pass changed files outside the audit's outputs (a worker writes only its findings):",
        );
        for (const p of changed) console.error(`  ${p}`);
        return 1;
    };

    if (pass === 'verify' || pass === 'complete') {
        const reportPath = path.join(cwd, files.data);
        if (!fs.existsSync(reportPath)) return fail(`${files.data} is missing — run spec-tools report${flag} first`);
        const report = readData<{ short: ShortPart[] }>(reportPath);
        if (pass === 'verify') {
            for (const f of fs.readdirSync(findings))
                if (/^(verdict-.*\.yaml|verifier-.*\.(jsonl|err|result\.yaml))$/.test(f))
                    fs.rmSync(path.join(findings, f));
            fs.writeFileSync(path.join(cwd, files.verified), '');
            const targets = kind.targets(report as never, partOf);
            if (!targets.length) {
                log(`spec-tools workers: nothing to verify — ${kind.none}`);
                return 0;
            }
            log(
                `spec-tools workers: verification pass over ${targets.length} finding(s), model ${env.AUDIT_MODEL_VERIFY || model} effort ${env.AUDIT_EFFORT_VERIFY || effort}`,
            );
            await runPass(targets.map((t, i) => () => verify(t, i + 1)));
            const code = unchanged();
            if (code === 0) log('spec-tools workers: verification done');
            return code;
        }
        if (!report.short.length) {
            log('spec-tools workers: nothing to complete — every part is covered');
            return 0;
        }
        log(
            `spec-tools workers: completion pass over ${report.short.length} short part(s), model ${model} effort ${effort}`,
        );
        const tasks = report.short.flatMap((s) => {
            const p = partOf(s.part);
            return p ? [() => work(p, s)] : [];
        });
        await runPass(tasks);
        const code = unchanged();
        if (code === 0) log('spec-tools workers: completion done');
        return code;
    }

    // The reading: every part, or in a parallel job the parts dealt to it in turn.
    const job = shard(env);
    const share = shareOf(scope.parts, job);
    const of = job.total > 1 ? ` — job ${job.index} of ${job.total}, its share of ${scope.parts.length}` : '';
    // The reading starts clean — of the run's files, or in one job of several of its own share's alone.
    const mine = new Set(share.map((p) => p.part));
    for (const f of fs.readdirSync(findings)) {
        const part = /^(?:part|worker)-(\d+)[-.]/.exec(f);
        const stale =
            job.total > 1
                ? part !== null && mine.has(Number(part[1]))
                : part !== null || /^(verdict-.*\.yaml|merge-.*\.yaml)$/.test(f);
        if (stale) fs.rmSync(path.join(findings, f));
    }
    if (job.total === 1) fs.rmSync(path.join(cwd, files.verified), { force: true });
    if (!share.length) {
        log(`spec-tools workers: no part to read${of}`);
        return unchanged();
    }
    log(
        `spec-tools workers: ${share.length} parts${of}, model ${model} effort ${effort}, ${limit === 0 ? 'all at once' : `${limit} at a time`}`,
    );
    await runPass(share.map((p) => () => work(p)));
    const missing = share.map((p) => p.findings[0]!).filter((f) => !fs.existsSync(path.join(cwd, f)));
    if (missing.length)
        log(
            `spec-tools workers: findings files not written (the completion pass judges those parts):\n${missing.join('\n')}`,
        );
    const code = unchanged();
    if (code === 0) log('spec-tools workers: done');
    return code;
}
