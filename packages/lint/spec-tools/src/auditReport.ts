import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { jsonrepair } from 'jsonrepair';

import type { UnitEntry } from './auditParts';
import type { ScopeJson } from './auditScope';
import { FINDINGS_DIR, PARTS_DIR, REPORT_FILE, REPORT_JSON, SCOPE_JSON, UNITS_FILE, VERIFIED_MARKER } from './files';
import { root } from './repo';

/**
 * The specification audit's report, merged mechanically from what each worker judged. A worker
 * writes its part's findings as JSON; nothing here judges again. What this does is what needs no
 * judgment: every ERROR's quotes are looked up at their `file:line` in the audited commit — `HEAD`,
 * which no worker can edit, or the working tree with `--worktree` when the working tree is what
 * `spec-tools audit --here` audits — and a finding whose quotes are not there is WARN; kinds are tiered
 * by the contract's list, and a finding against an ⚠️ Advisory requirement is at most WARN;
 * coverage is the weakest part's; the verdict follows from those; and the Markdown CI and the reader
 * consume is rendered from it. The JSON files stay beside the report for debugging.
 * Usage: spec-tools report [--gate] [--worktree]
 */

/** One merge of a run, as it stood after the pass before it: `audit-parts/findings/merge-<n>.json`. */
export const MERGE_FILE = /^merge-\d+\.json$/;
/** One verifier's answer over one ERROR: `audit-parts/findings/verdict-<k>.json`. */
export const VERDICT_FILE = /^verdict-(\d+)\.json$/;

export const ERROR_CLASS = ['code-mismatch', 'conflict', 'undeclared-gap'] as const;
export const INFO_CLASS = ['spec-dup', 'untested'] as const;

/** The checks every reader runs over every requirement of its part — the `spec-verify` skill's numbering. */
export const CHECKS: Record<string, string> = {
    '1': 'Gap honesty',
    '2': 'Contradictory rules',
    '3': 'A rule redundant with, or substantially overlapping, another',
    '4': 'A rule that no longer matches the implementation or architecture',
    '5': 'A rule whose tests satisfy the wording while failing to protect the intent',
};

export type Tier = 'ERROR' | 'WARN' | 'INFO';
export type Quote = { readonly file: string; readonly line: number; readonly text: string };
export type Finding = {
    readonly kind: string;
    readonly tier: Tier;
    readonly where: string;
    readonly detail: string;
    readonly quotes?: readonly Quote[];
};
export type Status = 'full' | 'sampled' | 'not-run';
/** Per check: `"full"`, or `"sampled: <what was skipped>"` / `"not-run: <why>"` — one string, few brackets to get wrong. */
export type Coverage = Record<string, string>;

/** The status a coverage entry states, and its note; anything unreadable ran nothing. */
export function coverageEntry(value: unknown): { status: Status; note?: string } {
    const m = typeof value === 'string' ? /^\s*(full|sampled|not-run)\b[\s:—-]*(.*)$/s.exec(value) : null;
    if (!m)
        return {
            status: 'not-run',
            note: value === undefined ? undefined : `unreadable coverage entry ${JSON.stringify(value)}`,
        };
    return { status: m[1] as Status, note: m[2]?.trim() || undefined };
}
export type PartFindings = {
    readonly part: number;
    /** The reader number the worker's brief gave it; the file name carries it too. */
    readonly reader?: number;
    readonly capabilities: readonly string[];
    readonly findings: readonly Finding[];
    readonly coverage: Coverage;
    /** Every requirement id the reader judged — the judged list the merge checks against the part. */
    readonly judged?: readonly string[];
    readonly notes?: readonly string[];
};
export type Graded = Finding & {
    readonly tier: Tier;
    readonly part: number;
    readonly reader?: number;
    readonly regraded?: string;
    /** The verification pass's answer on an ERROR: confirmed, not confirmed with the verifier's reason, or never reached. */
    readonly verified?: string;
};

/** What a verifier writes: the finding it judged, named the way the merge matches defects, and its answer. */
/** A verifier's answer, `verdict-<k>.json`: it answers the k-th ERROR, so it names nothing but its verdict. */
export type Verdict = {
    readonly verdict: 'confirmed' | 'warn';
    readonly reason: string;
};

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Whether the quote is really at its line: the normalized quote appears in the normalized text of the
 * lines starting at the cited line or one above and running one line past what the quote spans — so a
 * fragment may run onto the next line and a worker copying from a numbered excerpt may be one line
 * out, never more.
 */
export function quoteFound(quote: Quote, lines: readonly string[] | undefined): boolean {
    if (!lines) return false;
    const wanted = normalize(quote.text);
    if (wanted === '') return false;
    const span = quote.text.split('\n').length + 1;
    for (const start of [quote.line - 1, quote.line - 2]) {
        if (start < 0 || start >= lines.length) continue;
        if (normalize(lines.slice(start, start + span).join(' ')).includes(wanted)) return true;
    }
    return false;
}

export type Reader = (file: string) => readonly string[] | undefined;

/** The audit's own artifacts are not evidence: a quote must come from a specification or a source. */
export const isGenerated = (file: string) =>
    file.startsWith(`${PARTS_DIR}/`) || /^(spec-verify|spec-review|spec-coverage|audit-scope)\.(md|json)$/.test(file);

/** Files as a commit carries them: `git show <ref>:<file>` — what no worker's edit of the tree can reach. */
export const gitReader =
    (ref: string, cwd: string = root()): Reader =>
    (file) => {
        try {
            return execFileSync('git', ['show', `${ref}:${file}`], {
                cwd,
                encoding: 'utf8',
                maxBuffer: 64 * 1024 * 1024,
                stdio: ['ignore', 'pipe', 'ignore'],
            }).split('\n');
        } catch {
            return undefined;
        }
    };

/** The audited commit: `HEAD`, the tree CI checked out and `spec-tools audit`'s detached worktree. */
export const commitReader: Reader = gitReader('HEAD');

/** A file as the working tree carries it — the audited tree of `spec-tools audit --here` alone. */
export const worktreeReader: Reader = (file) => {
    try {
        return fs.readFileSync(path.join(root(), file), 'utf8').split('\n');
    } catch {
        return undefined;
    }
};

/**
 * The tier a finding earns: INFO-class kinds are INFO however the worker graded them; an ERROR-class
 * kind is ERROR only when the worker claimed it and at least two of its quotes — both sides — are
 * found at their lines, and WARN otherwise, saying why; and a finding against an ⚠️ Advisory
 * requirement is at most WARN. A kind the contract does not name is recorded as INFO with the
 * note, never invented into a failure.
 */
export function grade(finding: Finding, part: number, read: Reader, advisory?: ReadonlySet<string>): Graded {
    const graded = gradeKind(finding, part, read);
    if (graded.tier !== 'ERROR' || !advisory?.has(unitOf(finding.where))) return graded;
    return {
        ...graded,
        tier: 'WARN',
        regraded: 'the requirement is ⚠️ Advisory: a finding against it is at most WARN',
    };
}

function gradeKind(finding: Finding, part: number, read: Reader): Graded {
    const kind = finding.kind;
    if ((INFO_CLASS as readonly string[]).includes(kind)) {
        return {
            ...finding,
            tier: 'INFO',
            part,
            regraded: finding.tier === 'INFO' ? undefined : `${kind} is INFO-class`,
        };
    }
    if (!(ERROR_CLASS as readonly string[]).includes(kind)) {
        return { ...finding, tier: 'INFO', part, regraded: `kind \`${kind}\` is not in the contract's list` };
    }
    if (finding.tier !== 'ERROR') {
        return {
            ...finding,
            tier: 'WARN',
            part,
            regraded: finding.tier === 'WARN' ? undefined : 'ERROR-class kinds are WARN at least',
        };
    }
    const quotes = (finding.quotes ?? []).filter((q) => !isGenerated(q.file));
    const missing = quotes.filter((q) => !quoteFound(q, read(q.file)));
    if (quotes.length < 2) {
        return {
            ...finding,
            tier: 'WARN',
            part,
            regraded: 'ERROR needs both sides quoted from the sources; fewer than two such quotes',
        };
    }
    if (missing.length > 0) {
        return {
            ...finding,
            tier: 'WARN',
            part,
            regraded: `re-proof failed: not found at ${missing.map((q) => `\`${q.file}:${q.line}\``).join(', ')}`,
        };
    }
    return { ...finding, tier: 'ERROR', part };
}

export type Merged = Record<string, { status: Status; parts: number[]; notes: string[] }>;

const rank: Record<Status, number> = { full: 0, sampled: 1, 'not-run': 2 };

/**
 * A part's coverage of a check is the best any of its readers achieved — two readers judge the same
 * evidence independently, so the part is covered when either judged it all. A part none of whose
 * readers reported ran nothing.
 */
export function partCoverage(
    readers: readonly (PartFindings | undefined)[],
    check: string,
): { status: Status; note?: string } {
    const present = readers.filter((r): r is PartFindings => r !== undefined);
    if (present.length === 0) return { status: 'not-run', note: 'no findings file' };
    return present
        .map((r) => coverageEntry(r.coverage?.[check]))
        .reduce((best, e) => (rank[e.status] < rank[best.status] ? e : best));
}

/**
 * The requirements of a part no reader listed as judged. A reader's claim of full coverage is only as
 * good as its judged list: a requirement absent from every reader's list was not judged, whatever the
 * coverage string says, and a reader with no judged list judged nothing that can be shown.
 */
export function unjudged(readers: readonly (PartFindings | undefined)[], expected: readonly string[]): string[] {
    const judged = new Set(readers.flatMap((r) => r?.judged ?? []));
    return expected.filter((id) => !judged.has(id));
}

/** A part's readers — one findings file each, or `undefined` for a reader that wrote none. */
export type PartReaders = readonly (PartFindings | undefined)[];

/**
 * The audit's coverage per check is its weakest part's. Every part owns every check, and every check runs
 * requirement by requirement, so each is also bounded by the readers' judged lists.
 */
export function mergeCoverage(
    parts: ReadonlyMap<number, PartReaders>,
    expected?: ReadonlyMap<number, readonly string[]>,
): Merged {
    const merged: Merged = Object.fromEntries(
        Object.keys(CHECKS).map((c) => [c, { status: 'full', parts: [], notes: [] }]),
    );
    for (const [n, readers] of [...parts].sort(([a], [b]) => a - b)) {
        const ids = expected?.get(n) ?? [];
        const missed = ids.length ? unjudged(readers, ids) : [];
        for (const check of Object.keys(CHECKS)) {
            let entry = partCoverage(readers, check);
            if (missed.length && entry.status === 'full') {
                const shown = missed
                    .slice(0, 5)
                    .map((id) => `\`${id}\``)
                    .join(', ');
                entry = {
                    status: 'sampled',
                    note: `judged list names ${ids.length - missed.length} of ${ids.length} requirements; not judged: ${shown}${missed.length > 5 ? ` and ${missed.length - 5} more` : ''}`,
                };
            }
            const slot = merged[check]!;
            if (entry.status !== 'full') {
                slot.parts.push(n);
                if (entry.note) slot.notes.push(`part ${n}: ${entry.note}`);
            }
            if (rank[entry.status] > rank[slot.status]) slot.status = entry.status;
        }
    }
    return merged;
}

/**
 * What a pass left for the completion pass, per part: the requirements no reader's judged list names, and
 * the checks no reader ran in full, each with the reader's own note. A part with no findings file is
 * short on everything — the completion pass then judges the whole part once, which is how a killed
 * worker is recovered without re-running the parts that finished.
 */
export type ShortPart = {
    readonly part: number;
    readonly requirementIds: readonly string[];
    readonly checks: Record<string, string>;
};

export function shortList(
    parts: ReadonlyMap<number, PartReaders>,
    expected: ReadonlyMap<number, readonly string[]>,
): ShortPart[] {
    const out: ShortPart[] = [];
    for (const [n, readers] of [...parts].sort(([a], [b]) => a - b)) {
        const ids = expected.get(n) ?? [];
        const requirementIds = ids.length ? unjudged(readers, ids) : [];
        const checks: Record<string, string> = {};
        for (const check of Object.keys(CHECKS)) {
            const entry = partCoverage(readers, check);
            if (entry.status !== 'full') checks[check] = `${entry.status}${entry.note ? `: ${entry.note}` : ''}`;
        }
        if (requirementIds.length || Object.keys(checks).length) out.push({ part: n, requirementIds, checks });
    }
    return out;
}

/**
 * The findings files a part has: the ones the scope lists, then any further `part-<n>-<reader>.json`
 * present — a completion worker writes the part's next reader number, and the merge reads it the
 * way it reads a second independent reader.
 */
export function readerFiles(listed: readonly string[], present: readonly string[], part: number): string[] {
    const own = new RegExp(`(^|/)part-${part}-\\d+\\.json$`);
    const extra = present.filter((f) => own.test(f) && !listed.includes(f)).sort();
    return [...listed, ...extra];
}

const tierRank: Record<Tier, number> = { ERROR: 0, WARN: 1, INFO: 2 };

/**
 * Two readers of one part report the same defect in their own words; it is one finding. Two
 * findings are the same when they share a kind and a quoted `file:line`, or a kind and a `where`;
 * the better-proved twin stands.
 */
export function dedupe(findings: readonly Graded[]): Graded[] {
    const kept: Graded[] = [];
    const sameQuote = (a: Graded, b: Graded) =>
        (a.quotes ?? []).some((q) => (b.quotes ?? []).some((p) => p.file === q.file && p.line === q.line));
    for (const f of findings) {
        const at = kept.findIndex(
            (k) => k.kind === f.kind && (normalize(k.where) === normalize(f.where) || sameQuote(k, f)),
        );
        if (at === -1) kept.push(f);
        else if (tierRank[f.tier] < tierRank[kept[at]!.tier]) kept[at] = f;
    }
    return kept;
}

/** Two findings are the same defect when they share a kind and a `where`, or a kind and a quoted `file:line`. */
const sameDefect = (a: Graded, b: Graded) =>
    a.kind === b.kind &&
    (normalize(a.where) === normalize(b.where) ||
        (a.quotes ?? []).some((q) => (b.quotes ?? []).some((p) => p.file === q.file && p.line === q.line)));

/**
 * The verification pass's answers, applied. An ERROR the workers demonstrated is put to one more reader
 * over that finding alone, which confirms it only when the divergence is real and critical — an obvious
 * code defect, or a statement that would steer an agent wrongly — and otherwise lowers it to WARN with
 * its reason. One the pass never reached (no verdict written although the pass ran) stands on its quotes
 * and says so; without the pass, nothing changes. WARN and INFO are never touched. A verdict answers the ERROR
 * at its position: `verdict-<k>.json` is the k-th ERROR of the merge the verification pass started from, and the
 * merge after it, over the same findings files, lists the same ERRORs in the same order.
 */
export function applyVerdicts(
    findings: readonly Graded[],
    verdicts: ReadonlyMap<number, Verdict>,
    ran: boolean,
): Graded[] {
    let k = 0;
    return findings.map((f) => {
        if (f.tier !== 'ERROR') return f;
        const v = verdicts.get(++k);
        if (!v)
            return ran
                ? { ...f, verified: 'unverified — the verifier wrote no verdict; the finding stands on its quotes' }
                : f;
        return v.verdict === 'confirmed'
            ? { ...f, verified: `confirmed — ${v.reason}` }
            : { ...f, tier: 'WARN', verified: `not confirmed — ${v.reason}` };
    });
}

/** Every verdict file the verification pass wrote, by the ERROR's position; one that does not parse is reported and skipped. */
export function readVerdicts(problems: string[]): Map<number, Verdict> {
    const dir = path.join(root(), FINDINGS_DIR);
    const out = new Map<number, Verdict>();
    if (!fs.existsSync(dir)) return out;
    for (const name of fs.readdirSync(dir).sort()) {
        const k = VERDICT_FILE.exec(name)?.[1];
        if (!k) continue;
        try {
            const v = JSON.parse(jsonrepair(fs.readFileSync(path.join(dir, name), 'utf8'))) as Verdict;
            if (v.verdict !== 'confirmed' && v.verdict !== 'warn') throw new Error('missing `verdict`');
            out.set(Number(k), v);
        } catch (error) {
            problems.push(
                `\`${FINDINGS_DIR}/${name}\` is not a valid verdict: ${(error as Error).message} — its ERROR stands on its quotes.`,
            );
        }
    }
    return out;
}

export function verdict(findings: readonly Graded[], coverage: Merged) {
    const errors = findings.filter((f) => f.tier === 'ERROR').length;
    const warnings = findings.filter((f) => f.tier === 'WARN').length;
    const incomplete = Object.values(coverage).some((c) => c.status !== 'full');
    const state = errors > 0 ? 'FAIL' : incomplete ? 'INCOMPLETE' : 'PASS';
    return { state, errors, warnings, line: `${state} (${errors} errors, ${warnings} warnings)` };
}

/**
 * The exit code a verdict earns when the report gates a run: 0 on PASS, 1 on FAIL, 3 on INCOMPLETE — an
 * allowed failure, so the job is marked failed and the pipeline continues.
 */
export const exitCodeFor = (state: string): number => (state === 'FAIL' ? 1 : state === 'INCOMPLETE' ? 3 : 0);

const cell = (s: string) => normalize(s).replace(/\|/g, '\\|');
const order: Record<Tier, number> = { ERROR: 0, WARN: 1, INFO: 2 };

/** What `audit-parts/units.json` holds: every unit in scope with its class. */
export type UnitsFile = Record<string, UnitEntry>;
/** The unit a finding is about: the requirement id its `where` opens with. */
export const unitOf = (where: string) => where.split(' ')[0]!;

/** A finding's first sentence, which is all the developer's report shows of its detail. */
const firstSentence = (text: string) => {
    const flat = normalize(text);
    const end = flat.search(/[.!?](\s|$)/);
    return end === -1 ? flat : flat.slice(0, end + 1);
};

/** One ERROR or WARN as the developer reads it: kind, place, requirement, what drifted, why it was regraded, the verifier's word. */
const findingLine = (f: Graded) => {
    const [requirement, at] = f.where.split(' / ');
    const place = at ?? (f.quotes?.[0] ? `${f.quotes[0].file}:${f.quotes[0].line}` : undefined);
    return [
        `- \`${f.kind}\``,
        place ? ` \`${place}\`` : '',
        ` — \`${requirement}\``,
        ` — ${firstSentence(f.detail)}`,
        f.regraded ? ` — _${f.regraded}_` : '',
        f.verified ? ` — _${f.verified}_` : '',
    ].join('');
};

/**
 * The developer's report: the verdict, what errored and what drifted — one line each — the INFO findings as counts,
 * and the checks that fell short. Quotes, full details and INFO findings are in `spec-verify.json`.
 */
export function render(
    scopeHeader: readonly string[],
    findings: readonly Graded[],
    coverage: Merged,
    problems: readonly string[],
): string {
    const v = verdict(findings, coverage);
    const out = [v.line, '', ...scopeHeader, ''];
    if (problems.length) out.push("## Problems with the workers' output", '', ...problems.map((p) => `- ${p}`), '');
    const sections = [
        ['ERROR', 'Errors — demonstrated and confirmed'],
        ['WARN', 'Warnings — suspected, or not confirmed'],
    ] as const;
    for (const [tier, title] of sections) {
        const items = findings
            .filter((f) => f.tier === tier)
            .sort((a, b) => a.kind.localeCompare(b.kind) || a.where.localeCompare(b.where));
        if (items.length) out.push(`## ${title}`, '', ...items.map(findingLine), '');
    }
    const info = new Map<string, number>();
    for (const f of findings) if (f.tier === 'INFO') info.set(f.kind, (info.get(f.kind) ?? 0) + 1);
    if (info.size) out.push('## Info', '', ...[...info].sort().map(([k, n]) => `- \`${k}\`: ${n}`), '');
    const short = Object.entries(CHECKS).filter(([c]) => coverage[c]!.status !== 'full');
    if (short.length) {
        out.push('## Coverage short', '');
        for (const [c, name] of short) {
            const m = coverage[c]!;
            out.push(
                `- ${c}. ${name}: ${m.status} — parts ${m.parts.join(', ')}${m.notes.length ? ` — ${m.notes.join('; ')}` : ''}`,
            );
        }
        out.push('');
    }
    return out.join('\n');
}

/** The report's first lines after the verdict: the scope. */
export function scopeHeader(scope: ScopeJson): string[] {
    if (scope.scope === 'affected') {
        return [
            'SCOPE affected',
            '',
            scope.parts.length === 0
                ? `The affected set against \`${scope.base ?? '?'}\` is empty — nothing to judge.`
                : `The affected set against \`${scope.base ?? '?'}\`: ${(scope.capabilities ?? []).length} capabilities in ${scope.parts.length} parts.`,
        ];
    }
    return ['SCOPE all', '', `Every capability under \`openspec/specs/\`, in ${scope.parts.length} parts.`];
}

export function main(read: Reader = commitReader): string {
    const scopePath = path.join(root(), SCOPE_JSON);
    // Every unit in scope, as `spec:scope` classed it.
    const unitsPath = path.join(root(), UNITS_FILE);
    const units: UnitsFile = fs.existsSync(unitsPath)
        ? (JSON.parse(fs.readFileSync(unitsPath, 'utf8')) as UnitsFile)
        : {};
    const advisory = new Set(Object.entries(units).flatMap(([id, u]) => (u.advisory ? [id] : [])));
    const scope: ScopeJson | undefined = fs.existsSync(scopePath)
        ? (JSON.parse(fs.readFileSync(scopePath, 'utf8')) as ScopeJson)
        : undefined;
    const problems: string[] = [];
    if (!scope) problems.push(`\`${SCOPE_JSON}\` is missing — run \`spec-tools scope\` first; one part assumed.`);
    const header = scope ? scopeHeader(scope) : ['SCOPE unknown'];
    const expected = scope ? scope.parts.length : 1;
    const parts = new Map<number, PartReaders>();
    const readers = scope?.readers ?? 1;
    const readPart = (files: readonly string[], n: number): (PartFindings | undefined)[] =>
        files.map((rel, index) => {
            const file = path.join(root(), rel);
            if (!fs.existsSync(file)) {
                problems.push(`\`${rel}\` was not written — reader ${index + 1} of part ${n} counts as not run.`);
                return undefined;
            }
            try {
                const text = fs.readFileSync(file, 'utf8');
                let parsed: PartFindings;
                try {
                    parsed = JSON.parse(text) as PartFindings;
                } catch (error) {
                    // A model's JSON slips — a comma, a trailing one, a quote. Repair the syntax deterministically
                    // and say so; content is never touched, and what cannot be repaired counts as not run.
                    parsed = JSON.parse(jsonrepair(text)) as PartFindings;
                    problems.push(
                        `\`${rel}\` needed a syntax repair (${(error as Error).message}); its content was kept as written.`,
                    );
                }
                if (!Array.isArray(parsed.findings) || typeof parsed.coverage !== 'object')
                    throw new Error('missing `findings` or `coverage`');
                return { ...parsed, part: n, capabilities: parsed.capabilities ?? [] };
            } catch (error) {
                problems.push(
                    `\`${rel}\` is not valid: ${(error as Error).message} — reader ${index + 1} of part ${n} counts as not run.`,
                );
                return undefined;
            }
        });
    const defaults = (n: number) =>
        Array.from({ length: readers }, (_, r) => `${FINDINGS_DIR}/part-${n}-${r + 1}.json`);
    const dir = path.join(root(), FINDINGS_DIR);
    const present = fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => `${FINDINGS_DIR}/${f}`) : [];
    for (let n = 1; n <= expected; n++)
        parts.set(n, readPart(readerFiles(scope?.parts[n - 1]?.findings ?? defaults(n), present, n), n));
    const findings = applyVerdicts(
        dedupe(
            [...parts.values()].flatMap((readers) =>
                readers.flatMap((p, index) =>
                    p ? p.findings.map((f) => ({ ...grade(f, p.part, read, advisory), reader: index + 1 })) : [],
                ),
            ),
        ),
        readVerdicts(problems),
        fs.existsSync(path.join(root(), VERIFIED_MARKER)),
    );
    const expectedIds = new Map((scope?.parts ?? []).map((p) => [p.part, p.requirementIds ?? []] as const));
    const coverage = mergeCoverage(parts, expectedIds);

    const report = render(header, findings, coverage, problems);
    fs.writeFileSync(path.join(root(), REPORT_FILE), report);
    const v = verdict(findings, coverage);
    const json =
        JSON.stringify(
            {
                verdict: v.line,
                state: v.state,
                errors: v.errors,
                warnings: v.warnings,
                findings,
                short: shortList(parts, expectedIds),
            },
            null,
            2,
        ) + '\n';
    fs.writeFileSync(path.join(root(), REPORT_JSON), json);
    // Every merge of a run kept beside the workers' files, numbered, so a run can be analysed pass by pass.
    fs.mkdirSync(dir, { recursive: true });
    const merges = fs.readdirSync(dir).filter((f) => MERGE_FILE.test(f)).length;
    fs.writeFileSync(path.join(dir, `merge-${merges + 1}.json`), json);
    return report;
}

/** `spec-tools report [--gate] [--worktree]`: the merge, its verdict line, and with `--gate` the verdict's exit code. */
export function cli(argv: readonly string[]): number {
    const line = main(argv.includes('--worktree') ? worktreeReader : commitReader).split('\n')[0]!;
    process.stdout.write(line + '\n');
    // `--gate`: the last merge of a run exits with the verdict's code; the intermediate merges only render.
    return argv.includes('--gate') ? exitCodeFor(line.split(' ')[0]!) : 0;
}
