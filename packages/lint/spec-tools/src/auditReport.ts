import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { UnitEntry } from './auditParts';
import type { ScopeData } from './auditScope';
import { checkData, JUDGE_VERDICT, parseData, readData, READER_FINDINGS, tryReadData, writeData } from './data';
import { AUDIT_DIR, FINDINGS_DIR, REPORT_DATA, REPORT_FILE, SCOPE_FILE, UNITS_FILE, VERIFIED_MARKER } from './files';
import { root } from './repo';
import {
    describeThresholds,
    fuse,
    isJudged,
    type Reading,
    THRESHOLDS,
    type Thresholds,
    thresholds,
    type Tier,
    tierOf,
} from './severity';

/**
 * The specification audit's report, merged mechanically from what each worker judged. A worker
 * writes its part's findings as YAML; nothing here judges again. What this does is what needs no
 * judgment: each finding's severity is capped by the contract's kind list, by an ⚠️ Advisory requirement,
 * and — for the ERROR band — by its quotes, looked up at their `file:line` in the audited commit (`HEAD`,
 * which no worker can edit, or the working tree with `--worktree` when the working tree is what
 * `spec-tools audit --here` audits); the judge's reading is fused with the reader's (`severity.ts`); the
 * thresholds give each finding its tier; coverage is the weakest part's; the verdict follows from those;
 * and the Markdown CI and the reader consume is rendered from it.
 * The YAML files stay beside the report for debugging.
 * Usage: spec-tools report [--gate] [--worktree]
 */

/** One merge of a run, as it stood after the pass before it: `.spec-audit/parts/findings/merge-<n>.yaml`. */
export const MERGE_FILE = /^merge-\d+\.yaml$/;
/** One judge's reading of one judged finding: `.spec-audit/parts/findings/verdict-<k>.yaml`. */
export const VERDICT_FILE = /^verdict-(\d+)\.yaml$/;

export const ERROR_CLASS = ['code-mismatch', 'undeclared-gap'] as const;
/** Kinds that are a defect in the specification, the owner's to decide: WARN at most (spec-verify rules, check 2). */
export const WARN_CLASS = ['conflict'] as const;
export const INFO_CLASS = ['spec-dup', 'untested'] as const;

/** The checks every reader runs over every requirement of its part — the `spec-verify` skill's numbering. */
export const CHECKS: Record<string, string> = {
    '1': 'Gap honesty',
    '2': 'Contradictory rules',
    '3': 'A rule redundant with, or substantially overlapping, another',
    '4': 'A rule that no longer matches the implementation or architecture',
    '5': 'A rule whose tests satisfy the wording while failing to protect the intent',
};

export type Quote = { readonly file: string; readonly line: number; readonly text: string };
export type Finding = {
    readonly kind: string;
    /** How severe the reader finds the defect, from 0 to 100, on the judging rules' scale. */
    readonly readerSeverity: number;
    readonly where: string;
    readonly detail: string;
    /** How sure the reader is that the defect exists as written and that its severity is right, from 0 to 100. */
    readonly readerConfidence: number;
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
    /** The fused severity and confidence — the reader's alone until a judge reads the finding — and their tier. */
    readonly severity: number;
    readonly confidence: number;
    readonly tier: Tier;
    readonly part: number;
    readonly reader?: number;
    /** The highest severity the finding can reach, and why: a deterministic rule no reading overrides. */
    readonly cap?: { readonly severity: number; readonly reason: string };
    /** Why the severity is below what the readings gave: the cap's reason, once it lowered them. */
    readonly regraded?: string;
    /** The verification pass's answer: the judge's reading with its reason, or why no judge read it. */
    readonly verified?: string;
    /** The judge's reading of the finding, from 0 to 100 each. */
    readonly judgeSeverity?: number;
    readonly judgeConfidence?: number;
    /** The production scenario the judge wrote for an ERROR-band reading. */
    readonly scenario?: string;
};

/** A judge's answer, `verdict-<k>.yaml`: it answers the k-th judged finding, so it names nothing but its reading. */
export type Verdict = {
    readonly judgeSeverity: number;
    readonly judgeConfidence: number;
    readonly reason: string;
    readonly scenario?: string;
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

/**
 * What is not the repository's own: the audit's artifacts, and installed dependency code, which the audit does not
 * judge — a dependency's defect is its own repository's, caught by tests. A quote from either proves nothing, and is
 * never looked up: an ERROR needs both sides quoted from the repository's specifications and sources.
 */
export const isForeign = (file: string) => file.startsWith(`${AUDIT_DIR}/`) || /(^|\/)node_modules\//.test(file);

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
 * The highest severity a finding can reach, and why, from deterministic rules alone: INFO-class kinds and kinds the
 * contract does not name stay below the WARN band; a WARN-class kind (a specification defect) and a finding against an
 * ⚠️ Advisory requirement stay below the ERROR band; and an ERROR-class kind reaches the ERROR band only when at least
 * two of its quotes — both sides, from the repository — are found at their lines. The lowest cap that applies wins;
 * none applies to a proved ERROR-class finding.
 */
export function capOf(
    finding: Finding,
    read: Reader,
    advisory?: ReadonlySet<string>,
    t: Thresholds = THRESHOLDS,
): Graded['cap'] {
    const kind = finding.kind;
    if ((INFO_CLASS as readonly string[]).includes(kind))
        return { severity: t.warn - 1, reason: `${kind} is INFO-class` };
    if (!(ERROR_CLASS as readonly string[]).includes(kind) && !(WARN_CLASS as readonly string[]).includes(kind))
        return { severity: t.warn - 1, reason: `kind \`${kind}\` is not in the contract's list` };
    if ((WARN_CLASS as readonly string[]).includes(kind))
        return { severity: t.error - 1, reason: `${kind} is a specification defect: WARN at most` };
    if (advisory?.has(unitOf(finding.where)))
        return {
            severity: t.error - 1,
            reason: 'the requirement is ⚠️ Advisory: a finding against it is at most WARN',
        };
    const quotes = (finding.quotes ?? []).filter((q) => !isForeign(q.file));
    if (quotes.length < 2)
        return {
            severity: t.error - 1,
            reason: 'ERROR needs both sides quoted from the sources; fewer than two such quotes',
        };
    const missing = quotes.filter((q) => !quoteFound(q, read(q.file)));
    if (missing.length)
        return {
            severity: t.error - 1,
            reason: `re-proof failed: not found at ${missing.map((q) => `\`${q.file}:${q.line}\``).join(', ')}`,
        };
    return undefined;
}

/** A reading under a cap, its tier, and the cap's reason when the cap lowered it. */
function graded(reading: Reading, cap: Graded['cap'], t: Thresholds) {
    const severity = cap ? Math.min(reading.severity, cap.severity) : reading.severity;
    const at = { severity, confidence: reading.confidence };
    return { ...at, tier: tierOf(at, t), ...(cap && severity < reading.severity ? { regraded: cap.reason } : {}) };
}

/** A reader's finding, graded: its reading under its cap, and the tier the thresholds give it. */
export function grade(
    finding: Finding,
    part: number,
    read: Reader,
    advisory?: ReadonlySet<string>,
    t: Thresholds = THRESHOLDS,
): Graded {
    const cap = capOf(finding, read, advisory, t);
    return {
        ...finding,
        part,
        ...(cap ? { cap } : {}),
        ...graded({ severity: finding.readerSeverity, confidence: finding.readerConfidence }, cap, t),
    };
}

/** Per check: its status, the parts that fell short with why, and what readers claimed — notes, never a status. */
export type Merged = Record<string, { status: Status; parts: number[]; notes: string[]; claims: string[] }>;

const rank: Record<Status, number> = { full: 0, sampled: 1, 'not-run': 2 };

/**
 * A part's coverage of a check, from mechanical signals only: a part with a valid findings file ran the check; a part
 * none of whose readers wrote one ran nothing. What a reader says of its own coverage ("sampled: …", "not-run: …") is
 * a claim no tool can prove — a path it names may not exist, or may have been there to read — so it is kept as a note
 * (`readerClaims`) and never makes a check fall short. Requirements missing from the judged lists do (`mergeCoverage`).
 */
export function partCoverage(readers: readonly (PartFindings | undefined)[]): { status: Status; note?: string } {
    return readers.some((r) => r !== undefined) ? { status: 'full' } : { status: 'not-run', note: 'no findings file' };
}

/**
 * What a part's readers claimed of their own coverage of a check, when they claimed less than full. A claim is what a
 * reader wrote: a check its coverage map leaves out (a completion reader names only the checks of its brief) is none.
 */
export function readerClaims(readers: readonly (PartFindings | undefined)[], check: string): string[] {
    return readers
        .filter((r): r is PartFindings => r?.coverage?.[check] !== undefined)
        .map((r) => coverageEntry(r.coverage[check]))
        .filter((e) => e.status !== 'full')
        .map((e) => `${e.status}${e.note ? `: ${e.note}` : ''}`);
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
        Object.keys(CHECKS).map((c) => [c, { status: 'full', parts: [], notes: [], claims: [] }]),
    );
    for (const [n, readers] of [...parts].sort(([a], [b]) => a - b)) {
        const ids = expected?.get(n) ?? [];
        const missed = ids.length ? unjudged(readers, ids) : [];
        for (const check of Object.keys(CHECKS)) {
            let entry = partCoverage(readers);
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
            for (const claim of readerClaims(readers, check)) slot.claims.push(`part ${n}: ${claim}`);
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
 * What a pass left for the completion pass, per part, from mechanical signals only: the requirements no reader's judged
 * list names. A part with no findings file is short on everything — the completion pass then judges the whole part
 * once, which is how a killed worker is recovered without re-running the parts that finished. A reader's claim that it
 * skipped a source ("sampled: …") is not re-read: a second reader under the same rules meets the same limit, so the
 * report lists the claim as a note.
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
        const entry = partCoverage(readers);
        if (entry.status !== 'full')
            for (const check of Object.keys(CHECKS))
                checks[check] = `${entry.status}${entry.note ? `: ${entry.note}` : ''}`;
        if (requirementIds.length || Object.keys(checks).length) out.push({ part: n, requirementIds, checks });
    }
    return out;
}

/**
 * The findings files a part has: the ones the scope lists, then any further `part-<n>-<reader>.yaml`
 * present — a completion worker writes the part's next reader number, and the merge reads it the
 * way it reads a second independent reader.
 */
export function readerFiles(listed: readonly string[], present: readonly string[], part: number): string[] {
    const own = new RegExp(`(^|/)part-${part}-\\d+\\.yaml$`);
    const extra = present.filter((f) => own.test(f) && !listed.includes(f)).sort();
    return [...listed, ...extra];
}

/**
 * Two readers of one part report the same defect in their own words; it is one finding. Two
 * findings are the same when they share a kind and a quoted `file:line`, or a kind and a `where`;
 * the more severe twin, after its cap, stands.
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
        else if (f.severity > kept[at]!.severity) kept[at] = f;
    }
    return kept;
}

/**
 * The verification pass's answers, applied. A finding the reader rated severe and sure enough (`isJudged`) is put to
 * one more reader over that finding alone — the judge — which gives its own severity and confidence; the two readings
 * are fused (`fuse`), the finding's cap applies again, and the thresholds give the tier. A judge reading in the ERROR
 * band with no production scenario caps the finding below that band. A finding the pass never reached (no verdict
 * written although the pass ran) keeps the reader's reading, which is an ERROR only above `sure`; without the pass,
 * nothing changes. A verdict answers the judged finding at its position: `verdict-<k>.yaml` is the k-th judged finding
 * of the merge the verification pass started from, and the merge after it, over the same findings files, lists the
 * same findings in the same order.
 */
export function applyVerdicts(
    findings: readonly Graded[],
    verdicts: ReadonlyMap<number, Verdict>,
    ran: boolean,
    t: Thresholds = THRESHOLDS,
): Graded[] {
    let k = 0;
    return findings.map((f) => {
        if (!isJudged(f, t)) return f;
        const v = verdicts.get(++k);
        if (!v) {
            if (!ran) return f;
            return {
                ...f,
                verified: `unverified — no verdict was written; the reader's severity ${f.severity} at ${f.confidence}% stands`,
            };
        }
        const unproved = v.judgeSeverity >= t.error && !v.scenario?.trim() && (f.cap?.severity ?? 100) >= t.error;
        const cap = unproved
            ? { severity: t.error - 1, reason: 'the judge gave an ERROR-band severity with no production scenario' }
            : f.cap;
        return {
            ...f,
            judgeSeverity: v.judgeSeverity,
            judgeConfidence: v.judgeConfidence,
            ...(v.scenario ? { scenario: v.scenario } : {}),
            ...graded(fuse([f, { severity: v.judgeSeverity, confidence: v.judgeConfidence }], t.ignoreGap), cap, t),
            verified: `judge: severity ${v.judgeSeverity} at ${v.judgeConfidence}% — ${v.reason}`,
        };
    });
}

/** Every verdict file the verification pass wrote, by the ERROR's position; one that is not valid is reported and skipped. */
export function readVerdicts(problems: string[]): Map<number, Verdict> {
    const dir = path.join(root(), FINDINGS_DIR);
    const out = new Map<number, Verdict>();
    if (!fs.existsSync(dir)) return out;
    for (const name of fs.readdirSync(dir).sort()) {
        const k = VERDICT_FILE.exec(name)?.[1];
        if (!k) continue;
        const text = fs.readFileSync(path.join(dir, name), 'utf8');
        const errors = checkData(text, JUDGE_VERDICT);
        if (errors.length) {
            problems.push(
                `\`${FINDINGS_DIR}/${name}\` is not a valid verdict: ${errors.join('; ')} — its finding counts as unverified.`,
            );
            continue;
        }
        out.set(Number(k), parseData<Verdict>(text));
    }
    return out;
}

/**
 * The verdict: FAIL when an ERROR stands at a confidence above `blocking`; ADVISORY when ERRORs stand, none above it;
 * INCOMPLETE when none stands but a check fell short; PASS otherwise.
 */
export function verdict(findings: readonly Graded[], coverage: Merged, t: Thresholds = THRESHOLDS) {
    const standing = findings.filter((f) => f.tier === 'ERROR');
    const errors = standing.length;
    const warnings = findings.filter((f) => f.tier === 'WARN').length;
    const incomplete = Object.values(coverage).some((c) => c.status !== 'full');
    const blocking = standing.some((f) => f.confidence > t.blocking);
    const state = blocking ? 'FAIL' : errors > 0 ? 'ADVISORY' : incomplete ? 'INCOMPLETE' : 'PASS';
    return { state, errors, warnings, line: `${state} (${errors} errors, ${warnings} warnings)` };
}

/**
 * The exit code a verdict earns when the report gates a run: 0 on PASS, 1 on FAIL, 77 on ADVISORY, 3 on INCOMPLETE —
 * 77 and 3 are allowed failures, so the job is marked failed and the pipeline continues.
 */
export const exitCodeFor = (state: string): number => ({ FAIL: 1, ADVISORY: 77, INCOMPLETE: 3 })[state] ?? 0;

/** What `.spec-audit/parts/units.yaml` holds: every unit in scope with its class. */
export type UnitsFile = Record<string, UnitEntry>;
/** The unit a finding is about: the requirement id its `where` opens with. */
export const unitOf = (where: string) => where.split(' ')[0]!;

/** A finding's first sentence, which is all the developer's report shows of its detail. */
const firstSentence = (text: string) => {
    const flat = normalize(text);
    const end = flat.search(/[.!?](\s|$)/);
    return end === -1 ? flat : flat.slice(0, end + 1);
};

/** The fused reading and each model's, as the report shows them. */
const readingOf = (f: Graded) =>
    `severity ${f.severity} at ${f.confidence}% (reader ${f.readerSeverity} at ${f.readerConfidence}%${
        f.judgeSeverity !== undefined ? `, judge ${f.judgeSeverity} at ${f.judgeConfidence}%` : ''
    })`;

/**
 * One ERROR or WARN as the developer reads it: kind, place, requirement, what drifted, the production scenario, the
 * readings, why it was regraded, the judge's word.
 */
const findingLine = (f: Graded) => {
    const [requirement, at] = f.where.split(' / ');
    const place = at ?? (f.quotes?.[0] ? `${f.quotes[0].file}:${f.quotes[0].line}` : undefined);
    return [
        `- \`${f.kind}\``,
        place ? ` \`${place}\`` : '',
        ` — \`${requirement}\``,
        ` — ${firstSentence(f.detail)}`,
        f.tier === 'ERROR' && f.scenario ? ` — **In production:** ${normalize(f.scenario)}` : '',
        ` — ${readingOf(f)}`,
        f.regraded ? ` — _${f.regraded}_` : '',
        f.verified ? ` — _${f.verified}_` : '',
    ].join('');
};

/**
 * The developer's report: the verdict, what errored and what drifted — one line each — the INFO findings as counts,
 * and the checks that fell short. Quotes, full details and INFO findings are in `.spec-audit/spec-verify.yaml`.
 */
export function render(
    scopeHeader: readonly string[],
    findings: readonly Graded[],
    coverage: Merged,
    problems: readonly string[],
    t: Thresholds = THRESHOLDS,
): string {
    const v = verdict(findings, coverage, t);
    const out = [v.line, '', ...scopeHeader, '', `Graded by: ${describeThresholds(t)}.`, ''];
    if (problems.length) out.push("## Problems with the workers' output", '', ...problems.map((p) => `- ${p}`), '');
    const sections = [
        [
            `Errors that fail the run — severity ${t.error} or more, confidence above ${t.blocking}%`,
            (f: Graded) => f.tier === 'ERROR' && f.confidence > t.blocking,
        ],
        [
            `Advisory errors — severity ${t.error} or more, confidence above ${t.sure}%, at ${t.blocking}% or lower`,
            (f: Graded) => f.tier === 'ERROR' && f.confidence <= t.blocking,
        ],
        [
            `Warnings — severity ${t.warn} or more, or severe but not sure enough for an ERROR`,
            (f: Graded) => f.tier === 'WARN',
        ],
    ] as const;
    for (const [title, belongs] of sections) {
        const items = findings
            .filter(belongs)
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
    const claims = Object.entries(CHECKS).filter(([c]) => coverage[c]!.claims.length);
    if (claims.length) {
        out.push(
            "## Readers' coverage notes",
            '',
            'What readers said they did not read. A note, not a shortfall: it changes no verdict.',
            '',
        );
        for (const [c, name] of claims) out.push(`- ${c}. ${name}: ${coverage[c]!.claims.join('; ')}`);
        out.push('');
    }
    return out.join('\n');
}

/** The report's first lines after the verdict: the scope. */
export function scopeHeader(scope: ScopeData): string[] {
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

export function main(read: Reader = commitReader, env: NodeJS.ProcessEnv = process.env): string {
    const t = thresholds(env);
    // Every unit in scope, as the scope classed it.
    const units = tryReadData<UnitsFile>(path.join(root(), UNITS_FILE)) ?? {};
    const advisory = new Set(Object.entries(units).flatMap(([id, u]) => (u.advisory ? [id] : [])));
    const scopePath = path.join(root(), SCOPE_FILE);
    const scope: ScopeData | undefined = fs.existsSync(scopePath) ? readData<ScopeData>(scopePath) : undefined;
    const problems: string[] = [];
    if (!scope) problems.push(`\`${SCOPE_FILE}\` is missing — run \`spec-tools scope\` first; one part assumed.`);
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
            // The workers send a file that fails its schema back to its reader; one that still fails counts as not run,
            // and the completion pass judges its part again.
            const text = fs.readFileSync(file, 'utf8');
            const errors = checkData(text, READER_FINDINGS);
            if (errors.length) {
                problems.push(
                    `\`${rel}\` is not valid: ${errors.slice(0, 3).join('; ')} — reader ${index + 1} of part ${n} counts as not run.`,
                );
                return undefined;
            }
            const parsed = parseData<PartFindings>(text);
            return { ...parsed, part: n, capabilities: parsed.capabilities ?? [] };
        });
    const defaults = (n: number) =>
        Array.from({ length: readers }, (_, r) => `${FINDINGS_DIR}/part-${n}-${r + 1}.yaml`);
    const dir = path.join(root(), FINDINGS_DIR);
    const present = fs.existsSync(dir) ? fs.readdirSync(dir).map((f) => `${FINDINGS_DIR}/${f}`) : [];
    for (let n = 1; n <= expected; n++)
        parts.set(n, readPart(readerFiles(scope?.parts[n - 1]?.findings ?? defaults(n), present, n), n));
    const findings = applyVerdicts(
        dedupe(
            [...parts.values()].flatMap((readers) =>
                readers.flatMap((p, index) =>
                    p ? p.findings.map((f) => ({ ...grade(f, p.part, read, advisory, t), reader: index + 1 })) : [],
                ),
            ),
        ),
        readVerdicts(problems),
        fs.existsSync(path.join(root(), VERIFIED_MARKER)),
        t,
    );
    const expectedIds = new Map((scope?.parts ?? []).map((p) => [p.part, p.requirementIds ?? []] as const));
    const coverage = mergeCoverage(parts, expectedIds);

    const report = render(header, findings, coverage, problems, t);
    fs.mkdirSync(path.dirname(path.join(root(), REPORT_FILE)), { recursive: true });
    fs.writeFileSync(path.join(root(), REPORT_FILE), report);
    const v = verdict(findings, coverage, t);
    const data = {
        verdict: v.line,
        state: v.state,
        errors: v.errors,
        warnings: v.warnings,
        thresholds: t,
        findings,
        short: shortList(parts, expectedIds),
    };
    writeData(path.join(root(), REPORT_DATA), data);
    // Every merge of a run kept beside the workers' files, numbered, so a run can be analysed pass by pass.
    fs.mkdirSync(dir, { recursive: true });
    const merges = fs.readdirSync(dir).filter((f) => MERGE_FILE.test(f)).length;
    writeData(path.join(dir, `merge-${merges + 1}.yaml`), data);
    return report;
}

/** `spec-tools report [--gate] [--worktree]`: the merge, its verdict line, and with `--gate` the verdict's exit code. */
export function cli(argv: readonly string[]): number {
    const line = main(argv.includes('--worktree') ? worktreeReader : commitReader).split('\n')[0]!;
    process.stdout.write(line + '\n');
    // `--gate`: the last merge of a run exits with the verdict's code; the intermediate merges only render.
    return argv.includes('--gate') ? exitCodeFor(line.split(' ')[0]!) : 0;
}
