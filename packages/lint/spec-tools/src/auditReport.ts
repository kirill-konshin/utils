import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { UnitEntry } from './auditParts';
import type { ScopeData } from './auditScope';
import { checkData, JUDGE_VERDICT, parseData, readData, READER_FINDINGS, tryReadData, writeData } from './data';
import { AUDIT_DIR, FINDINGS_DIR, REPORT_DATA, REPORT_FILE, SCOPE_FILE, UNITS_FILE, VERIFIED_MARKER } from './files';
import { root } from './repo';

/**
 * The specification audit's report, merged mechanically from what each worker judged. A worker
 * writes its part's findings as YAML; nothing here judges again. What this does is what needs no
 * judgment: every ERROR's quotes are looked up at their `file:line` in the audited commit — `HEAD`,
 * which no worker can edit, or the working tree with `--worktree` when the working tree is what
 * `spec-tools audit --here` audits — and a finding whose quotes are not there is WARN; kinds are tiered
 * by the contract's list, and a finding against an ⚠️ Advisory requirement is at most WARN; the judge's
 * verdict keeps an ERROR only when it confirms it with a confidence above `SURE`; coverage is the weakest
 * part's; the verdict follows from those; and the Markdown CI and the reader consume is rendered from it.
 * The YAML files stay beside the report for debugging.
 * Usage: spec-tools report [--gate] [--worktree]
 */

/** One merge of a run, as it stood after the pass before it: `.spec-audit/parts/findings/merge-<n>.yaml`. */
export const MERGE_FILE = /^merge-\d+\.yaml$/;
/** One verifier's answer over one ERROR: `.spec-audit/parts/findings/verdict-<k>.yaml`. */
export const VERDICT_FILE = /^verdict-(\d+)\.yaml$/;

/** A finding is a sure ERROR only when the judge's confidence — or, unjudged, the reader's — is above this. */
export const SURE = 70;
/** An ERROR fails the run only when that confidence is above this; ERRORs at `SURE` to this exit 77, advisory. */
export const BLOCKING = 80;

/** The confidence an ERROR stands at: the judge's, else the reader's. */
export const confidenceOfError = (f: { judgeConfidence?: number; readerConfidence?: number }): number =>
    f.judgeConfidence ?? f.readerConfidence ?? 0;

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

export type Tier = 'ERROR' | 'WARN' | 'INFO';
export type Quote = { readonly file: string; readonly line: number; readonly text: string };
export type Finding = {
    readonly kind: string;
    readonly tier: Tier;
    readonly where: string;
    readonly detail: string;
    /** How sure the reader is that the finding is an ERROR — the defect and its production effect — from 0 to 100. */
    readonly readerConfidence?: number;
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
    /** How sure the judge is that the finding is an ERROR, from 0 to 100. */
    readonly judgeConfidence?: number;
    /** The production scenario the judge wrote when it confirmed the ERROR. */
    readonly scenario?: string;
};

/** A verifier's answer, `verdict-<k>.yaml`: it answers the k-th ERROR, so it names nothing but its verdict. */
export type Verdict = {
    readonly verdict: 'confirmed' | 'warn';
    readonly reason: string;
    readonly scenario?: string;
    readonly judgeConfidence: number;
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
 * The tier a finding earns: INFO-class kinds are INFO however the worker graded them; WARN-class kinds (a
 * specification defect) are WARN at most; a WARN or INFO the worker gave stands, never raised; an ERROR-class
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
    if ((WARN_CLASS as readonly string[]).includes(kind)) {
        return {
            ...finding,
            tier: finding.tier === 'INFO' ? 'INFO' : 'WARN',
            part,
            regraded: finding.tier === 'ERROR' ? `${kind} is a specification defect: WARN at most` : undefined,
        };
    }
    if (!(ERROR_CLASS as readonly string[]).includes(kind)) {
        return { ...finding, tier: 'INFO', part, regraded: `kind \`${kind}\` is not in the contract's list` };
    }
    // The reader's WARN or INFO stands: the merge never raises a tier.
    if (finding.tier !== 'ERROR') return { ...finding, part };
    const quotes = (finding.quotes ?? []).filter((q) => !isForeign(q.file));
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

/** What a part's readers claimed of their own coverage of a check, when they claimed less than full. */
export function readerClaims(readers: readonly (PartFindings | undefined)[], check: string): string[] {
    return readers
        .filter((r): r is PartFindings => r !== undefined)
        .map((r) => coverageEntry(r.coverage?.[check]))
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
 * What a pass left for the completion pass, per part: the requirements no reader's judged list names, and
 * the checks no reader says it ran in full, each with the reader's own note — read once more, though a reader's claim
 * changes no verdict. A part with no findings file is
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
        const present = readers.filter((r) => r !== undefined).length;
        for (const check of Object.keys(CHECKS)) {
            const entry = partCoverage(readers);
            // What every reader says it skipped is read once more by the completion pass; it changes no verdict.
            const claims = readerClaims(readers, check);
            if (entry.status !== 'full') checks[check] = `${entry.status}${entry.note ? `: ${entry.note}` : ''}`;
            else if (claims.length && claims.length === present) checks[check] = claims[0]!;
        }
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

/**
 * The verification pass's answers, applied. An ERROR the workers demonstrated is put to one more reader over that
 * finding alone — the judge — which confirms it only when the defect is real and has a production effect, and gives
 * its confidence. The finding stays ERROR only when the judge confirms it with a confidence above `SURE`; otherwise
 * it is WARN with the judge's reason. One the pass never reached (no verdict written although the pass ran) stays
 * ERROR only when the reader's own confidence is above `SURE`; without the pass, nothing changes. The judge only
 * confirms or lowers: WARN and INFO are never touched. A verdict answers the ERROR at its position:
 * `verdict-<k>.yaml` is the k-th ERROR of the merge the verification pass started from, and the merge after it, over
 * the same findings files, lists the same ERRORs in the same order.
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
        if (!v) {
            if (!ran) return f;
            const reader = f.readerConfidence ?? 0;
            return reader > SURE
                ? { ...f, verified: `unverified — no verdict was written; the reader is ${reader}% sure` }
                : {
                      ...f,
                      tier: 'WARN',
                      verified: `unverified — no verdict was written, and the reader is only ${reader}% sure`,
                  };
        }
        const judged = { ...f, judgeConfidence: v.judgeConfidence, ...(v.scenario ? { scenario: v.scenario } : {}) };
        if (v.verdict === 'confirmed' && v.judgeConfidence > SURE)
            return { ...judged, verified: `confirmed — ${v.reason}` };
        return {
            ...judged,
            tier: 'WARN',
            verified:
                v.verdict === 'confirmed'
                    ? `confirmed, but the judge is only ${v.judgeConfidence}% sure — ${v.reason}`
                    : `not confirmed — ${v.reason}`,
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
                `\`${FINDINGS_DIR}/${name}\` is not a valid verdict: ${errors.join('; ')} — its ERROR counts as unverified.`,
            );
            continue;
        }
        out.set(Number(k), parseData<Verdict>(text));
    }
    return out;
}

/**
 * The verdict: FAIL when an ERROR stands above `BLOCKING`; ADVISORY when ERRORs stand, none above it; INCOMPLETE when
 * none stands but a check fell short; PASS otherwise.
 */
export function verdict(findings: readonly Graded[], coverage: Merged) {
    const standing = findings.filter((f) => f.tier === 'ERROR');
    const errors = standing.length;
    const warnings = findings.filter((f) => f.tier === 'WARN').length;
    const incomplete = Object.values(coverage).some((c) => c.status !== 'full');
    const blocking = standing.some((f) => confidenceOfError(f) > BLOCKING);
    const state = blocking ? 'FAIL' : errors > 0 ? 'ADVISORY' : incomplete ? 'INCOMPLETE' : 'PASS';
    return { state, errors, warnings, line: `${state} (${errors} errors, ${warnings} warnings)` };
}

/**
 * The exit code a verdict earns when the report gates a run: 0 on PASS, 1 on FAIL, 77 on ADVISORY, 3 on INCOMPLETE —
 * 77 and 3 are allowed failures, so the job is marked failed and the pipeline continues.
 */
export const exitCodeFor = (state: string): number => ({ FAIL: 1, ADVISORY: 77, INCOMPLETE: 3 })[state] ?? 0;

const cell = (s: string) => normalize(s).replace(/\|/g, '\\|');
const order: Record<Tier, number> = { ERROR: 0, WARN: 1, INFO: 2 };

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

/** The reader's and the judge's confidence, as the report shows them. */
const confidenceOf = (f: Graded) =>
    [
        f.readerConfidence !== undefined ? `reader ${f.readerConfidence}%` : '',
        f.judgeConfidence !== undefined ? `judge ${f.judgeConfidence}%` : '',
    ]
        .filter(Boolean)
        .join(', ');

/**
 * One ERROR or WARN as the developer reads it: kind, place, requirement, what drifted, the production scenario, the
 * confidences, why it was regraded, the judge's word.
 */
const findingLine = (f: Graded) => {
    const [requirement, at] = f.where.split(' / ');
    const place = at ?? (f.quotes?.[0] ? `${f.quotes[0].file}:${f.quotes[0].line}` : undefined);
    const confidence = confidenceOf(f);
    return [
        `- \`${f.kind}\``,
        place ? ` \`${place}\`` : '',
        ` — \`${requirement}\``,
        ` — ${firstSentence(f.detail)}`,
        f.tier === 'ERROR' && f.scenario ? ` — **In production:** ${normalize(f.scenario)}` : '',
        confidence ? ` — ${confidence}` : '',
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
): string {
    const v = verdict(findings, coverage);
    const out = [v.line, '', ...scopeHeader, ''];
    if (problems.length) out.push("## Problems with the workers' output", '', ...problems.map((p) => `- ${p}`), '');
    const sections = [
        [
            `Errors that fail the run — confirmed above ${BLOCKING}%`,
            (f: Graded) => f.tier === 'ERROR' && confidenceOfError(f) > BLOCKING,
        ],
        [
            `Advisory errors — confirmed above ${SURE}%, at ${BLOCKING}% or lower`,
            (f: Graded) => f.tier === 'ERROR' && confidenceOfError(f) <= BLOCKING,
        ],
        ['Warnings — suspected, without a production effect, or not confirmed', (f: Graded) => f.tier === 'WARN'],
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

export function main(read: Reader = commitReader): string {
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
    fs.mkdirSync(path.dirname(path.join(root(), REPORT_FILE)), { recursive: true });
    fs.writeFileSync(path.join(root(), REPORT_FILE), report);
    const v = verdict(findings, coverage);
    const data = {
        verdict: v.line,
        state: v.state,
        errors: v.errors,
        warnings: v.warnings,
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
