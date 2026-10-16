import * as fs from 'node:fs';
import * as path from 'node:path';

import {
    contextOf,
    distinctiveTerms,
    idOf,
    loadEvidence,
    renderChanged,
    type Requirement,
    requirementsOf,
} from './auditParts';
import { syncedUnarchivedChanges, touchedOpenChanges } from './changeGates';
import { diffBase } from './ci';
import { PARTS_DIR } from './files';
import { git, root } from './repo';
import { isSource, termPattern } from './steward/lib/evidence';
import { stripComments } from './steward/lib/scan';

/**
 * The focused check an editor runs before handing a specification change back, and the affected set of a merge
 * request or a push in CI — with the evidence to validate each requirement against the rest, quoted in full, so a
 * sentence that contradicts a sibling is caught by the author, not by the next audit. Deterministic; the judging is
 * the audit skill's focused mode over the one file this writes, or the audit's parts. The diff base is `diffBase`'s.
 *
 * The set is built in three stages, each tuned by one variable (`affectedOptions`):
 *
 *   judged = UNIT( EXPAND^HOPS( SEED_CONTEXT(diff) ) )
 *
 * SEED (`AUDIT_AFFECTED_CONTEXT`): the requirements the diff edits or a touched delta names, and those a changed line
 * reaches — inside the window of a binding or a citation of them, or naming one of their distinctive terms (a
 * removed source line included). EXPAND (`AUDIT_AFFECTED_HOPS`): each hop adds the related requirements of the set.
 * UNIT (`AUDIT_AFFECTED_UNIT`): the set alone, the set plus each capability whose specification the diff edits,
 * or every capability in the set whole. Each stage only adds; a tighter value always gives a subset.
 */
export const CHANGED_FILE = `${PARTS_DIR}/changed.yaml`;

/** What a judged set is cut to: its requirements, plus the capabilities the diff edits, or its capabilities whole. */
export const AFFECTED_UNITS = ['requirement', 'edited', 'capability'] as const;
export type AffectedUnit = (typeof AFFECTED_UNITS)[number];
/** How far a changed line reaches: this many lines around it, or the whole changed file. */
export type ContextLines = number | 'file';
export type AffectedOptions = { readonly context: ContextLines; readonly hops: number; readonly unit: AffectedUnit };

/**
 * The defaults, measured on real pushes: three lines of context (what a reviewer sees in a diff) cost little over
 * the changed lines alone; a second hop roughly doubles the set; whole capabilities multiplied it by two to five.
 */
export const AFFECTED_DEFAULTS: { readonly context: number; readonly hops: number; readonly unit: AffectedUnit } = {
    context: 3,
    hops: 1,
    unit: 'edited',
};

/** The affected set's three variables, validated; an unset or empty one takes its default. */
export function affectedOptions(env: NodeJS.ProcessEnv = process.env): AffectedOptions {
    const count = (name: string, fallback: number, also = ''): number => {
        const value = env[name];
        if (!value) return fallback;
        if (!/^\d+$/.test(value)) throw new Error(`${name} must be a whole number of 0 or more${also}, not "${value}"`);
        return Number(value);
    };
    const unit = env.AUDIT_AFFECTED_UNIT || AFFECTED_DEFAULTS.unit;
    if (!AFFECTED_UNITS.includes(unit as AffectedUnit))
        throw new Error(`AUDIT_AFFECTED_UNIT must be one of ${AFFECTED_UNITS.join(', ')}, not "${unit}"`);
    return {
        context:
            env.AUDIT_AFFECTED_CONTEXT === 'file'
                ? 'file'
                : count('AUDIT_AFFECTED_CONTEXT', AFFECTED_DEFAULTS.context, ', or "file"'),
        hops: count('AUDIT_AFFECTED_HOPS', AFFECTED_DEFAULTS.hops),
        unit: unit as AffectedUnit,
    };
}

/** The variables as one line, for the reports that say what a run judged by. */
export const describeOptions = (o: AffectedOptions): string =>
    `AUDIT_AFFECTED_CONTEXT=${o.context}, AUDIT_AFFECTED_HOPS=${o.hops}, AUDIT_AFFECTED_UNIT=${o.unit}`;

/** One hunk of a unified diff: the new-side lines it changed (`+start,count`), and the lines it removed. */
export type Hunk = {
    readonly file: string;
    readonly start: number;
    readonly count: number;
    readonly removed: readonly string[];
};

/**
 * Every hunk of a unified diff, per file — the new lines a change touched and the old lines it removed. A deleted
 * file's hunks are under its old path.
 */
export function hunksOf(diff: string): Hunk[] {
    const hunks: { file: string; start: number; count: number; removed: string[] }[] = [];
    let from = '';
    let file = '';
    let header = true;
    for (const line of diff.split('\n')) {
        if (line.startsWith('diff --git ')) {
            [from, file, header] = ['', '', true];
            continue;
        }
        const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
        if (h) {
            header = false;
            if (file)
                hunks.push({ file, start: Number(h[1]), count: h[2] === undefined ? 1 : Number(h[2]), removed: [] });
            continue;
        }
        if (header) {
            const old = /^--- (?:a\/(.+)|\/dev\/null)$/.exec(line);
            if (old) from = old[1] ?? '';
            const now = /^\+\+\+ (?:b\/(.+)|\/dev\/null)$/.exec(line);
            if (now) file = now[1] ?? from;
        } else if (line.startsWith('-')) hunks.at(-1)?.removed.push(line.slice(1));
    }
    return hunks;
}

/**
 * Whether a hunk changes lines `from`–`to` of `file`, or lines within `context` of them; a deleted-only hunk
 * (count 0) touches the line it sits at, and `file` makes any hunk in the file touch every line of it.
 */
export const touches = (
    hunks: readonly Hunk[],
    file: string,
    from: number,
    to: number,
    context: ContextLines = 0,
): boolean =>
    hunks.some(
        (h) =>
            h.file === file &&
            (context === 'file' || (h.start - context <= to && h.start + Math.max(h.count, 1) - 1 + context >= from)),
    );

/** The requirements whose blocks a hunk overlaps; a deleted-only hunk (count 0) touches the block at its line. */
export function requirementsTouched(hunks: readonly Hunk[], all: readonly Requirement[]): Requirement[] {
    const touched: Requirement[] = [];
    for (const r of all) {
        if (touches(hunks, r.file, r.line, r.endLine) && !touched.includes(r)) touched.push(r);
    }
    return touched;
}

export type DeltaOp = 'ADDED' | 'MODIFIED' | 'REMOVED' | 'RENAMED';
export type DeltaBlock = { readonly op: DeltaOp; readonly name: string; readonly block: string };

/** A delta file's requirement blocks by operation; a RENAMED entry is named by its FROM heading and has no block. */
export function deltaBlocks(text: string): DeltaBlock[] {
    const out: DeltaBlock[] = [];
    let op: DeltaOp | '' = '';
    const lines = text.split('\n');
    lines.forEach((line, i) => {
        const s = /^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements/.exec(line);
        if (s) {
            op = s[1] as DeltaOp;
            return;
        }
        if (op === 'RENAMED') {
            const from = /^- FROM: `### Requirement: (.+)`\s*$/.exec(line);
            if (from) out.push({ op, name: from[1]!.trim(), block: '' });
            return;
        }
        const h = /^### Requirement: (.+)$/.exec(line);
        if (op && h) {
            let end = lines.findIndex((l, j) => j > i && /^##/.test(l) && !l.startsWith('####'));
            if (end < 0) end = lines.length;
            out.push({ op, name: h[1]!.trim(), block: lines.slice(i, end).join('\n') });
        }
    });
    return out;
}

/** The backticked spans of a text — the form a requirement names its terms in. */
const codeSpans = (text: string) => new Set([...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!.trim()));

/**
 * Before sync a request's claim on the corpus is its deltas: a MODIFIED, REMOVED or RENAMED-FROM heading
 * maps to the standing requirement it names; an ADDED one has no standing counterpart yet and maps to
 * its lexical neighbours — the standing requirements of its capability sharing the most terms with it.
 */
export function deltaRequirements(deltaText: string, capability: string, all: readonly Requirement[]): Requirement[] {
    const own = all.filter((r) => r.capability === capability);
    const out = new Set<Requirement>();
    for (const { op, name, block } of deltaBlocks(deltaText)) {
        if (op !== 'ADDED') {
            const r = own.find((x) => x.name === name);
            if (r) out.add(r);
            continue;
        }
        const spans = codeSpans(block);
        own.map((r) => ({ r, shared: r.terms.filter((t) => spans.has(t.term)).length }))
            .filter(({ shared }) => shared > 0)
            .sort((a, b) => b.shared - a.shared || a.r.line - b.r.line)
            .slice(0, 2)
            .forEach(({ r }) => out.add(r));
    }
    return [...out];
}

/**
 * The requirements a diff's changed lines reach, each line widened by `context`: those with a binding (a test, type
 * assertion, lint entry or check) or a citation whose window a changed line falls in — a test binding's window is
 * its test block, any other's the lines from the citation on — and those with a distinctive term on a changed line
 * of a source file, or on a line a source file lost, so deleting the code behind a requirement still reaches it.
 */
export function reachedBy(
    hunks: readonly Hunk[],
    all: readonly Requirement[],
    context: ContextLines = AFFECTED_DEFAULTS.context,
): Requirement[] {
    const distinctive = distinctiveTerms(all);
    const removed = hunks
        .filter((h) => h.removed.length && isSource(h.file))
        .map((h) => stripComments(h.file, h.removed.join('\n')))
        .join('\n');
    const lost = new Map<string, boolean>();
    const wasRemoved = (term: string) => lost.get(term) ?? lost.set(term, termPattern(term).test(removed)).get(term)!;
    const inWindow = (c: { readonly file: string; readonly window: readonly [number, number] }) =>
        touches(hunks, c.file, c.window[0], c.window[1], context);
    return all.filter(
        (r) =>
            r.bindings.some(inWindow) ||
            r.pointers.some(inWindow) ||
            r.terms.some(
                (t) =>
                    distinctive.has(t.term) &&
                    (t.hits.some((h) => touches(hunks, h.file, h.line, h.line, context)) || wasRemoved(t.term)),
            ),
    );
}

export type Scope = {
    readonly base: string;
    /** The judged set, after all three stages. */
    readonly requirements: Requirement[];
    readonly capabilities: string[];
    /** The capabilities whose specification the diff edits. */
    readonly edited: string[];
    readonly options: AffectedOptions;
};

/**
 * Stages EXPAND and UNIT over a seed: each hop adds the related requirements of the set so far; then `edited` adds
 * every requirement of each capability the diff edits, and `capability` every requirement of each capability in the
 * set or edited. The seed comes first, in its order.
 */
export function grow(
    seed: readonly Requirement[],
    all: readonly Requirement[],
    edited: readonly string[],
    options: Pick<AffectedOptions, 'hops' | 'unit'>,
): Requirement[] {
    const byId = new Map(all.map((r) => [idOf(r), r]));
    const set = new Map(seed.map((r) => [idOf(r), r]));
    for (let hop = 0; hop < options.hops; hop++)
        for (const r of [...set.values()])
            for (const { id } of r.related) {
                const other = byId.get(id);
                if (other) set.set(id, other);
            }
    const whole = new Set(
        options.unit === 'capability' ? [...edited, ...[...set.values()].map((r) => r.capability)] : edited,
    );
    if (options.unit !== 'requirement') for (const r of all) if (whole.has(r.capability)) set.set(idOf(r), r);
    return [...set.values()];
}

/** The capability a specification file belongs to: `openspec/specs/<capability>/spec.md`. */
const capabilityOf = (file: string) => /^openspec\/specs\/(.+)\/spec\.md$/.exec(file)?.[1];

/** The affected set against a base, built in the three stages the module names. */
export function affectedScope(
    base: string,
    all: readonly Requirement[] = requirementsOf(loadEvidence()),
    options: AffectedOptions = affectedOptions(),
): Scope {
    const set = new Map<string, Requirement>();
    const add = (r: Requirement) => set.set(idOf(r), r);

    // SEED. `-M`: a moved capability's hunks are its edits, addressed by its new path — a pure move touches nothing.
    const specHunks = hunksOf(git(['diff', '-M', '--unified=0', base, '--', 'openspec/specs']));
    for (const r of requirementsTouched(specHunks, all)) add(r);
    const known = new Set(all.map((r) => r.capability));
    const edited = [...new Set(specHunks.map((h) => capabilityOf(h.file)))]
        .filter((c): c is string => !!c && known.has(c))
        .sort();

    const synced = new Set(syncedUnarchivedChanges().map((s) => s.split(' — ')[0]!));
    for (const change of touchedOpenChanges(base).filter((c) => !synced.has(c))) {
        const specs = path.join(root(), 'openspec/changes', change, 'specs');
        if (!fs.existsSync(specs)) continue;
        const walk = (dir: string): string[] =>
            fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
                const full = path.join(dir, entry.name);
                return entry.isDirectory() ? walk(full) : entry.name === 'spec.md' ? [full] : [];
            });
        for (const delta of walk(specs)) {
            const capability = path.relative(specs, path.dirname(delta));
            for (const r of deltaRequirements(fs.readFileSync(delta, 'utf8'), capability, all)) add(r);
        }
    }

    // An untracked file is changed throughout.
    const untracked = git(['ls-files', '--others', '--exclude-standard'])
        .split('\n')
        .filter(Boolean)
        .map((file): Hunk => ({ file, start: 1, count: Number.MAX_SAFE_INTEGER, removed: [] }));
    for (const r of reachedBy([...hunksOf(git(['diff', '--unified=0', base])), ...untracked], all, options.context))
        add(r);

    const requirements = grow([...set.values()], all, edited, options);
    return {
        base,
        requirements,
        capabilities: [...new Set(requirements.map((r) => r.capability))].sort(),
        edited,
        options,
    };
}

export function main(env: NodeJS.ProcessEnv = process.env): string {
    const base = diffBase(env);
    const all = requirementsOf(loadEvidence());
    const scope = affectedScope(base, all, affectedOptions(env));
    const text = renderChanged(scope.requirements, contextOf(all), base, describeOptions(scope.options));
    fs.mkdirSync(path.join(root(), PARTS_DIR), { recursive: true });
    fs.writeFileSync(path.join(root(), CHANGED_FILE), text);
    const by = describeOptions(scope.options);
    return scope.requirements.length
        ? `${scope.requirements.length} requirement(s) in scope against ${base} (${by}) → ${CHANGED_FILE}:\n${scope.requirements.map((r) => `- ${idOf(r)}`).join('\n')}\n`
        : `Nothing in scope against ${base} (${by}); ${CHANGED_FILE} says so.\n`;
}
