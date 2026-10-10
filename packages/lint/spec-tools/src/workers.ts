/**
 * The specification audit's fan-out, deterministic: headless `claude --print` workers started from here — no
 * orchestrating model decides when or whether the next worker starts. Each worker loads the `spec-verify` skill for its
 * contract — the five checks, the grading, the findings file — and writes its own findings file; `spec-tools report`
 * merges after every pass. CI's reading jobs and judge job, and `spec-tools audit`, run the passes in this order:
 *
 *   1. reading      One worker per part of `audit-scope.json`, judging every check over every requirement of its part.
 *                   In a parallel job (`ci.ts` `shard`) only the job's share: part p goes to job ((p - 1) mod total) + 1,
 *                   so each job works its share out from the scope alone. Then, in the judge, the merge.
 *   2. complete     One worker per part the merge left short — the `short` list of `spec-verify.json` — over exactly
 *                   those items, writing the part's next reader file. Nothing already judged is judged twice.
 *   3. verify       One verifier per ERROR the merge left standing, over that finding alone, confirming it only when
 *                   the divergence is real and critical and lowering it to WARN with its reason otherwise, on
 *                   AUDIT_MODEL_VERIFY. Then the last merge, whose verdict gates.
 *
 * A worker writes its findings file and nothing else. Every pass compares the tree it leaves with the tree it found —
 * each changed or untracked file with its content's hash — and fails, exit 1, naming the paths, when anything changed
 * outside the audit's own outputs (`audit-parts/`, `spec-verify.*`, CI's `job-log-*`).
 *
 * Models, efforts and gating are the run class's (`tier.ts`); how many parts there are is the evidence's
 * (`auditScope.ts`), and how many run at once is memory's, below.
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Finding, ShortPart } from './auditReport';
import type { Part, ScopeJson } from './auditScope';
import { shard } from './ci';
import { AUDIT_FILES, type AuditFiles, type AuditName, findingsFile } from './files';
import { git, root } from './repo';
import * as steward from './stewardAudit';
import { CHEAP_EFFORT, CHEAP_MODEL, EXPENSIVE_MODEL } from './tier';

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
/**
 * Each headless worker is a node process of about 500 MB resident — 590 MB at the most, measured over 24 cheap-tier
 * workers — so in a container the count follows the cgroup memory limit at 600 MB per worker (at least two).
 */
const PER_WORKER_BYTES = 600 * 1024 * 1024;
/** What a pass may leave behind besides nothing. */
const OUTPUTS = /^(audit-parts\/|spec-verify\.|job-log-)/;

/** How many workers run at once: memory's bound in a container, capped by AUDIT_WORKERS; else AUDIT_WORKERS, else all. */
export function concurrency(env: NodeJS.ProcessEnv, memoryLimit = cgroupLimit()): number {
    const asked = Number(env.AUDIT_WORKERS) || 0;
    if (memoryLimit === null) return asked; // 0: every task at once
    const bound = Math.max(2, Math.floor(memoryLimit / PER_WORKER_BYTES));
    return asked > 0 ? Math.min(asked, bound) : bound;
}

function cgroupLimit(): number | null {
    for (const file of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) {
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
    'Tool rule: only Skill, Read, Glob, Grep, Write, Edit and the git commands — no ls/cat/find, no shell validation of your JSON; other commands are denied here and only cost a turn.';
/** The shipped skill, two levels above this module in the source and in the build alike. */
const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../skills/spec-verify/SKILL.md');
/** Loading the skill: by name where the repository links it, else from the package — a job with no install links none. */
const loadSkill = (repo: string) =>
    `First, load the skill instructions: use the Skill tool with skill "spec-verify" (or Read ${path.relative(repo, SKILL)} if that fails) to get the checks, the grading contract, the findings-file contract and the tool rules. Follow them exactly.`;

/** The reading brief: one part, every check over every requirement of it. */
export const brief = (
    p: Part,
    repo: string,
): string => `You are a worker for the spec-verify audit skill in repo ${repo}.

${loadSkill(repo)}

Your assignment:
- part: ${p.part}
- reader: 1
- capabilities: ${p.capabilities.join(', ')}
- findings file to write (Write tool, overwrite, nothing else): ${p.findings[0]}
- evidence files to read in full: ${p.files.join(', ')}
- requirementIds (your judged list must cover exactly these):
${p.requirementIds.join('\n')}

Judge checks 1–5 over every requirement, every bound test, every listed term occurrence and every listed related pair. Complete this assigned evidence: read any named source window before judging and list every requirement id in your judged list. An uncertain conclusion is a WARN finding, not sampled coverage; use \`sampled\` only if an assigned source remains genuinely unavailable after reading it. A test that proves less than its rule is an \`untested\` finding with check 5 still full — a coverage note names what you did not read, never what a test did not assert. ${TOOL_RULE} Write the findings file exactly at the path above, then return one line: the path and your counts per tier.
`;

/**
 * The completion brief: the same contract, over exactly what the first pass left. A check the first pass left short is
 * judged over the requirements its note names, or over the whole part when it names none; a requirement no judged
 * list names is judged for checks 1–5.
 */
export const briefComplete = (p: Part, short: ShortPart, reader: number, file: string, repo: string): string => {
    const ids = short.requirementIds.length ? short.requirementIds.join('\n') : '(none)';
    const checks = Object.entries(short.checks);
    return `You are a completion worker for the spec-verify audit skill in repo ${repo}. The first pass over part ${p.part} was left short; judge exactly what it left, and nothing else — every other requirement and check of this part is already judged.

${loadSkill(repo)}

Your assignment:
- part: ${p.part}
- reader: ${reader}
- capabilities: ${p.capabilities.join(', ')}
- findings file to write (Write tool, overwrite, nothing else): ${file}
- evidence files (read the requirement blocks you judge in full, with their bound tests, term occurrences and related lists): ${p.files.join(', ')}
- requirements the first pass did not judge — judge checks 1–5 over each:
${ids}
- checks the first pass left short, with its own note — judge each in full over the requirements the note names, or over every requirement of the part when it names none:
${checks.length ? checks.map(([check, note]) => `  ${check}: ${note}`).join('\n') : '  (none)'}

Your findings file has the usual shape. Its coverage object names exactly the checks this brief names — each "full" when you judged every item named for it, otherwise "sampled: <what was skipped>" — and its judged list names exactly the requirement ids you judged here. This completion pass must close the named shortfall: read any required source window and record uncertainty as a WARN finding, not sampled coverage. A shortfall that is really a judgment about a test — it covers less than its rule — is closed by writing that judgment as an \`untested\` finding and marking the check full. Use \`sampled\` only if an assigned source remains genuinely unavailable after reading it. ${TOOL_RULE} Write the findings file exactly at the path above, then return one line: the path and your counts per tier.
`;
};

/** The verifier's brief: one finding, one question, no skill to load — the contract is here in full. */
export const briefVerify = (f: Finding, p: Part | undefined, file: string, repo: string): string => {
    const { kind, where, detail, quotes } = f;
    return `You are the verifier for ONE finding of the spec-verify audit in repo ${repo}. A worker graded it ERROR, and its quotes were found at their lines mechanically. Your job is to decide whether it should stop the build.

The finding:
${JSON.stringify({ kind, where, detail, quotes }, null, 2)}

Read, with the Read and Grep tools only: the requirement's block in the part's evidence files (${p?.files.join(', ') ?? 'audit-parts/'} — Grep the slug from "where"), both quoted sources at and around the quoted lines, and enough of the surrounding code to know what it does. Do not shell out (no ls/cat/find); other commands are denied and only cost a turn.

Confirm the ERROR only when ALL of these hold:
1. The quotes are genuine and say what the finding claims.
2. The requirement and the code genuinely diverge — not a vague requirement read narrowly, not an ambiguity the surrounding code resolves, not behaviour implemented elsewhere that the finding did not look at.
3. The divergence is critical: an obvious code defect — the code does something different from what the requirement mandates in a way a caller, a test or an operator would observe — or a statement that would steer an agent wrongly (a prompt, a tool description, a workflow rule the agents follow).

Otherwise the finding is WARN. A citation or a comment is never evidence either way: judge the requirement and the code. Write exactly this JSON with the Write tool to ${file} and nothing else:
{"verdict": "confirmed" | "warn", "reason": "<one sentence: for confirmed, the observable consequence; for warn, which of the three conditions fails and why>"}
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
};

/** One thing the verification pass puts to a verifier: a label for the log, and its brief. */
type Target = { readonly label: string; readonly brief: (file: string, repo: string) => string };

/** What differs between the audits the engine runs: their files, tools, default model, briefs and verification targets. */
type Kind = {
    readonly files: AuditFiles;
    readonly tools: string;
    readonly model: string;
    readonly effort: string;
    readonly brief: (p: Part, repo: string) => string;
    readonly briefComplete: (p: Part, short: ShortPart, reader: number, file: string, repo: string) => string;
    readonly targets: (data: never, partOf: (n: number) => Part | undefined) => Target[];
    readonly none: string;
};

const KINDS: Record<AuditName, Kind> = {
    'spec-verify': {
        files: AUDIT_FILES['spec-verify'],
        tools: TOOLS,
        model: CHEAP_MODEL,
        effort: CHEAP_EFFORT,
        brief,
        briefComplete,
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
        model: EXPENSIVE_MODEL,
        effort: 'high',
        brief: steward.brief,
        briefComplete: steward.briefComplete,
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
 * whole stream, and its own reason — e.g. an API usage-limit error — is echoed next to the exit status.
 */
async function runClaude(run: Run, wrote: () => boolean, budget: number, env: NodeJS.ProcessEnv, cwd: string) {
    const jsonl = path.join(cwd, run.dir, `${run.log}.jsonl`);
    const err = path.join(cwd, run.dir, `${run.log}.err`);
    const args = ['--print', run.prompt, '--model', run.model, '--effort', run.effort, '--permission-mode', 'default'];
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
    if (killed) return `killed after ${Math.round(budget / 60_000)}m`;
    if (code !== 0) {
        const why = String(resultOf(jsonl)?.result ?? '').slice(0, 200);
        return `exit ${code}${why ? ` (${why})` : ''}`;
    }
    if (wrote()) {
        const r = resultOf(jsonl);
        const kept = r && {
            subtype: r.subtype,
            is_error: r.is_error,
            duration_ms: r.duration_ms,
            num_turns: r.num_turns,
            total_cost_usd: r.total_cost_usd,
            usage: r.usage,
        };
        fs.writeFileSync(jsonl.replace(/\.jsonl$/, '.result.json'), kept ? JSON.stringify(kept) + '\n' : '');
        fs.rmSync(jsonl);
        if (fs.statSync(err).size === 0) fs.rmSync(err);
    }
    return 'ok';
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

const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;

/** One pass of the audit's workers; the exit code: 0 done, 1 the tree changed, 2 an input is missing. */
export async function workers(
    pass: Pass,
    { audit = 'spec-verify', context, env = process.env, cwd = root(), log = console.log }: Options = {},
) {
    const withContext = (prompt: string) =>
        context?.trim()
            ? `${prompt}\nRun context — facts established and decisions the owner has already made. Judge with them; a finding or a verdict that would reverse one says so:\n${context.trim()}\n`
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
    const scope = readJson<ScopeJson>(scopePath);
    const model = env.AUDIT_MODEL || kind.model;
    const effort = env.AUDIT_EFFORT || kind.effort;
    const budget = duration(env.AUDIT_WORKER_TIMEOUT || '20m');
    const limit = concurrency(env);
    const findings = path.join(cwd, files.findings);
    fs.mkdirSync(findings, { recursive: true });
    const before = treeState(cwd);
    const partOf = (n: number) => scope.parts.find((p) => p.part === n);
    const repo = cwd;

    const work = async (p: Part, short?: ShortPart) => {
        // The completion worker is the part's next reader: one more findings file, never an overwrite.
        const reader = short
            ? fs.readdirSync(findings).filter((f) => new RegExp(`^part-${p.part}-\\d+\\.json$`).test(f)).length + 1
            : 1;
        const file = short ? findingsFile(p.part, reader, audit) : p.findings[0]!;
        const prompt = withContext(short ? kind.briefComplete(p, short, reader, file, repo) : kind.brief(p, repo));
        const started = Date.now();
        log(`[${clock()}] worker ${p.part} started — ${short ? `completion, reader ${reader}, ` : ''}${model}`);
        const logName = short ? `worker-${p.part}-${reader}` : `worker-${p.part}`;
        const full = path.join(cwd, file);
        const status = await runClaude(
            { prompt, model, effort, log: logName, dir: files.findings, tools: kind.tools },
            () => fs.existsSync(full),
            budget,
            env,
            cwd,
        );
        let wrote = 'no findings file';
        if (fs.existsSync(full)) {
            try {
                const json = readJson<{ findings?: unknown[]; judged?: unknown[] }>(full);
                wrote = `${json.findings?.length ?? 0} findings, judged ${json.judged?.length ?? 0}`;
            } catch {
                wrote = 'unparseable findings file';
            }
        }
        log(
            `[${clock()}] worker ${p.part} finished in ${Math.round((Date.now() - started) / 1000)}s — ${status} — ${wrote}`,
        );
    };

    const verify = async (target: Target, k: number) => {
        const file = `${files.findings}/verdict-${k}.json`;
        const full = path.join(cwd, file);
        const started = Date.now();
        log(`[${clock()}] verifier ${k} started — ${target.label}`);
        const run = {
            prompt: withContext(target.brief(file, repo)),
            model: env.AUDIT_MODEL_VERIFY || model,
            effort: env.AUDIT_EFFORT_VERIFY || effort,
            log: `verifier-${k}`,
            dir: files.findings,
            tools: kind.tools,
        };
        const status = await runClaude(run, () => fs.existsSync(full), budget, env, cwd);
        let wrote = 'no verdict file';
        if (fs.existsSync(full)) {
            try {
                const v = readJson<{ verdict: string; reason: string }>(full);
                wrote = `${v.verdict} — ${v.reason}`;
            } catch {
                wrote = 'unparseable verdict file';
            }
        }
        log(
            `[${clock()}] verifier ${k} finished in ${Math.round((Date.now() - started) / 1000)}s — ${status} — ${wrote}`,
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
        const report = readJson<{ short: ShortPart[] }>(reportPath);
        if (pass === 'verify') {
            for (const f of fs.readdirSync(findings))
                if (/^(verdict-.*\.json|verifier-.*\.(jsonl|err|result\.json))$/.test(f))
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
            await pool(
                targets.map((t, i) => () => verify(t, i + 1)),
                limit,
            );
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
        await pool(tasks, limit);
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
                : part !== null || /^(verdict-.*\.json|merge-.*\.json)$/.test(f);
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
    await pool(
        share.map((p) => () => work(p)),
        limit,
    );
    const missing = share.map((p) => p.findings[0]!).filter((f) => !fs.existsSync(path.join(cwd, f)));
    if (missing.length)
        log(
            `spec-tools workers: findings files not written (the completion pass judges those parts):\n${missing.join('\n')}`,
        );
    const code = unchanged();
    if (code === 0) log('spec-tools workers: done');
    return code;
}
