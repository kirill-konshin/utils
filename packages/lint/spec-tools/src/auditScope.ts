import * as fs from 'node:fs';
import * as path from 'node:path';

import { affectedScope } from './auditChanged';
import { type EvidenceFile, loadEvidence, PART_BYTES, requirementsOf, writeParts } from './auditParts';
import { diffBase, isNightly, mergeRequest } from './ci';
import { AUDIT_FILES, type AuditName, findingsFile, PARTS_DIR } from './files';
import { root } from './repo';
import { sweepUnits } from './stewardAudit';

/**
 * The specification audit's scope and partition — decided here, mechanically, never by the audit.
 * Two scopes: the whole corpus, because a change can break a rule in a capability it never touched or
 * cited; and an affected set — the requirements it changes or its deltas name, those
 * whose bound tests or own terms the changed files contain, those its changed code cites, and the
 * requirements related to these (`auditChanged.ts`) — judged with cross-capability checks against the
 * corpus the evidence quotes. The mode is `modeFor`'s: `AUDIT_SCOPE` from `spec-tools tier` when set,
 * else the nightly input or the absence of a merge-request target means the corpus. The scope is cut
 * into parts no larger than one reader holds in full, from evidence files the same run writes from
 * spec-steward's evidence model — see `auditParts.ts` — so the audit reads and never searches. The cut is
 * computed once, into `audit-scope.json`, and every reading job takes its share of that file.
 */

export type ScopeKind = 'all' | 'affected';

/**
 * Which scope a run audits: the tier script's decision when it made one, else the corpus on the nightly
 * and wherever there is no merge-request target, and the request's affected set otherwise.
 */
export function modeFor(env: NodeJS.ProcessEnv = process.env): ScopeKind {
    if (env.AUDIT_SCOPE === 'affected') return 'affected';
    if (env.AUDIT_SCOPE === 'corpus') return 'all';
    if (isNightly(env)) return 'all';
    return mergeRequest(env)?.target ? 'affected' : 'all';
}

/**
 * What judging one requirement costs a worker, in bytes of evidence: a part of 36 requirements finished
 * minutes after one of 13 at the same size, so the partition places the heaviest first by both. About two
 * kilobytes each.
 */
export const REQUIREMENT_BYTES = 2 * 1024;
/**
 * Independent readers per part. Two readers roughly doubled a pass's yield but doubled its time; one
 * reader with a judged list the merge checks is the current setting.
 */
export const READERS_PER_PART = 1;

export type Part = {
    readonly part: number;
    readonly capabilities: readonly string[];
    /** The evidence files the part's readers read. */
    readonly files: readonly string[];
    /** Where each reader writes its findings: `audit-parts/findings/part-<n>-<reader>.json`. */
    readonly findings: readonly string[];
    /** Every requirement in the part, by id — what a reader's judged list is checked against. */
    readonly requirementIds: readonly string[];
    readonly bytes: number;
    readonly requirements: number;
    /** A spec-steward sweep: a unit that looks across the corpus from one angle rather than at capabilities. */
    readonly sweep?: { readonly key: string; readonly title: string; readonly focus: string };
};

const findingsFiles = (part: number, audit: AuditName) =>
    Array.from({ length: READERS_PER_PART }, (_, r) => findingsFile(part, r + 1, audit));
/** An evidence file's load on a worker: its evidence, plus the requirements it must walk one by one. */
export const load = (w: Pick<EvidenceFile, 'bytes' | 'requirements'>) => w.bytes + w.requirements * REQUIREMENT_BYTES;

/**
 * The partition the audit starts from — decided here so the orchestrator opens nothing before its workers run.
 * `slots` parts are one round of workers: AUDIT_JOBS reading jobs (the pipeline's own count, one unless it says) of
 * AUDIT_SLOTS workers each (from `spec-tools tier`). Evidence files are
 * placed heaviest first, by evidence and requirements, each into the lightest part it fits in under `PART_BYTES`; a
 * file no part has room for opens another, so only a scope larger than a round holds takes a second round, and no part
 * is larger than one reader holds unless one file alone is. Empty parts are dropped: nothing in scope is none. A
 * function of the files alone, in whatever order they come: the parts are numbered heaviest first.
 */
export function partition(files: readonly EvidenceFile[], audit: AuditName = 'spec-verify', slots = 1): Part[] {
    const order = [...files].sort((x, y) => load(y) - load(x) || (x.file < y.file ? -1 : x.file > y.file ? 1 : 0));
    const bins: EvidenceFile[][] = Array.from({ length: Math.max(1, slots) }, () => []);
    const bytesOf = (bin: readonly EvidenceFile[]) => bin.reduce((sum, f) => sum + f.bytes, 0);
    const loadOf = (bin: readonly EvidenceFile[]) => bin.reduce((sum, f) => sum + load(f), 0);
    for (const f of order) {
        const room = bins.filter((b) => bytesOf(b) + f.bytes <= PART_BYTES || !b.length);
        if (room.length) room.reduce((a, b) => (loadOf(b) < loadOf(a) ? b : a)).push(f);
        else bins.push([f]);
    }
    return bins
        .filter((bin) => bin.length)
        .sort((a, b) => loadOf(b) - loadOf(a))
        .map((bin, index) => ({
            part: index + 1,
            capabilities: [...new Set(bin.map((f) => f.capability))],
            files: bin.map((f) => f.file),
            findings: findingsFiles(index + 1, audit),
            requirementIds: bin.flatMap((f) => f.requirementIds),
            bytes: bytesOf(bin),
            requirements: bin.reduce((sum, f) => sum + f.requirements, 0),
        }));
}

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function renderScope(parts: readonly Part[], kind: ScopeKind = 'all', detail?: string): string {
    const lines = [
        `SCOPE ${kind}`,
        '',
        kind === 'all'
            ? 'Every capability under `openspec/specs/`: a change can break a rule in a capability it never touched or cited.'
            : (detail ?? 'The affected set.'),
        '',
        '## Parts',
        '',
        `Every part's worker judges its evidence files under \`${PARTS_DIR}/\` — a capability whole, or a capability cut between its requirements — for every check: the specification against itself (2, 3) and the code against it (1, 4, 5).`,
        '',
    ];
    lines.push(
        `${READERS_PER_PART} independent readers per part, each writing its own findings file; the merge unions what they found.`,
        '',
    );
    if (parts.length === 0) {
        lines.push(
            'Nothing in scope: the request touches no requirement, no delta, no bound test and no source where a requirement names a term — there is nothing to judge, and the verdict is PASS.',
        );
    } else if (parts.length === 1) {
        lines.push(`One part, ${parts[0]!.requirements} requirements (${kb(parts[0]!.bytes)}).`);
    } else {
        lines.push(`${parts.length} parts, ${READERS_PER_PART} workers each, one round across the reading jobs:`, '');
        parts.forEach((part) =>
            lines.push(
                `- Part ${part.part} (${part.requirements} requirements, ${kb(part.bytes)}): ${part.files.map((f) => `\`${f.slice(PARTS_DIR.length + 1)}\``).join(', ')}`,
            ),
        );
    }
    return lines.join('\n') + '\n';
}

/** What `audit-scope.json` holds: the parts, with the files each worker reads. */
export type ScopeJson = {
    readonly scope: ScopeKind;
    /** The affected set's diff base and capabilities; absent for the corpus. */
    readonly base?: string;
    readonly capabilities?: readonly string[];
    readonly readers: number;
    readonly parts: readonly Part[];
};

/**
 * The scope of one audit. spec-verify's parts are capabilities; spec-steward's are the same parts plus its sweeps, each a
 * unit of its own after the last part.
 */
export function main(env: NodeJS.ProcessEnv = process.env, audit: AuditName = 'spec-verify'): string {
    const kind = modeFor(env);
    const model = loadEvidence();
    const all = requirementsOf(model);
    const affected = kind === 'affected' ? affectedScope(diffBase(env), all) : undefined;
    const corpus = [...new Set(all.map((r) => r.capability))].sort();
    const capabilityParts = partition(
        writeParts(affected ? affected.capabilities : corpus, all),
        audit,
        (Number(env.AUDIT_JOBS) || 1) * (Number(env.AUDIT_SLOTS) || 1),
    );
    const parts =
        audit === 'spec-steward' ? [...capabilityParts, ...sweepUnits(model, capabilityParts.length)] : capabilityParts;
    const detail = affected
        ? `The affected set against \`${affected.base}\`: ${affected.requirements.length} requirements in ${affected.capabilities.length} capabilities — the ones the diff changed or a touched delta names, the ones whose bound tests or own terms the changed files contain, the ones the changed code cites, and the requirements related to these — with cross-capability checks against the corpus the evidence quotes.`
        : undefined;
    const report = renderScope(parts, kind, detail);
    const json: ScopeJson = {
        scope: kind,
        ...(affected ? { base: affected.base, capabilities: affected.capabilities } : {}),
        readers: READERS_PER_PART,
        parts,
    };
    const file = path.join(root(), AUDIT_FILES[audit].scope);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
    return report;
}
