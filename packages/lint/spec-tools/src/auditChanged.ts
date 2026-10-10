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

/**
 * The focused check an editor runs before handing a specification change back, and the affected set of a merge
 * request or a push in CI: which requirements the diff changed or a touched delta names, which ones the changed
 * files bind or name the terms of, which ones the changed code cites, and the requirements related to
 * these — with the evidence to validate each against the rest, quoted in full — so a sentence that
 * contradicts a sibling is caught by the author, not by the next audit. Deterministic; the judging is the
 * audit skill's focused mode over the one file this writes. The diff base is `diffBase`'s.
 */
export const CHANGED_FILE = `${PARTS_DIR}/changed.yaml`;

export type Hunk = { readonly file: string; readonly start: number; readonly count: number };

/** The `+c,d` side of every hunk in a unified diff, per file — the new lines a change touched. */
export function hunksOf(diff: string): Hunk[] {
    const hunks: Hunk[] = [];
    let file = '';
    for (const line of diff.split('\n')) {
        const f = /^\+\+\+ b\/(.+)$/.exec(line);
        if (f) {
            file = f[1]!;
            continue;
        }
        const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
        if (h && file) hunks.push({ file, start: Number(h[1]), count: h[2] === undefined ? 1 : Number(h[2]) });
    }
    return hunks;
}

/** The requirements whose blocks a hunk overlaps; a deleted-only hunk (count 0) touches the block at its line. */
export function requirementsTouched(hunks: readonly Hunk[], all: readonly Requirement[]): Requirement[] {
    const touched: Requirement[] = [];
    for (const r of all) {
        const hit = hunks.some(
            (h) => h.file === r.file && h.start <= r.endLine && h.start + Math.max(h.count, 1) - 1 >= r.line,
        );
        if (hit && !touched.includes(r)) touched.push(r);
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
 * The requirements a set of changed files reaches: those a test, type assertion, lint entry or check in a changed
 * file binds; those a changed file cites; and those whose distinctive terms occur in a changed file, so a change to
 * code no citation names still has its requirements judged.
 */
export function reachedBy(changed: ReadonlySet<string>, all: readonly Requirement[]): Requirement[] {
    const distinctive = distinctiveTerms(all);
    return all.filter(
        (r) =>
            r.bindings.some((b) => changed.has(b.file)) ||
            r.pointers.some((p) => changed.has(p.file)) ||
            r.terms.some((t) => distinctive.has(t.term) && t.hits.some((h) => changed.has(h.file))),
    );
}

export type Scope = {
    readonly base: string;
    readonly requirements: Requirement[];
    readonly capabilities: string[];
};

/**
 * The affected set against a base: the standing requirements the diff changed, the ones a touched unsynced change's
 * deltas name, the ones the changed files bind, cite or name the terms of, and the requirements related to these.
 */
export function affectedScope(base: string, all: readonly Requirement[] = requirementsOf(loadEvidence())): Scope {
    const byId = new Map(all.map((r) => [idOf(r), r]));
    const set = new Map<string, Requirement>();
    const add = (r: Requirement) => set.set(idOf(r), r);

    // `-M`: a moved capability's hunks are its edits, addressed by its new path — a pure move touches nothing.
    for (const r of requirementsTouched(hunksOf(git(['diff', '-M', '--unified=0', base, '--', 'openspec/specs'])), all))
        add(r);

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

    const changed = new Set(
        [
            ...git(['diff', '--name-only', base]).split('\n'),
            ...git(['ls-files', '--others', '--exclude-standard']).split('\n'),
        ].filter(Boolean),
    );
    for (const r of reachedBy(changed, all)) add(r);

    for (const r of [...set.values()])
        for (const { id } of r.related) {
            const other = byId.get(id);
            if (other) add(other);
        }
    return {
        base,
        requirements: [...set.values()],
        capabilities: [...new Set([...set.values()].map((r) => r.capability))].sort(),
    };
}

export function main(env: NodeJS.ProcessEnv = process.env): string {
    const base = diffBase(env);
    const all = requirementsOf(loadEvidence());
    const scope = affectedScope(base, all);
    const text = renderChanged(scope.requirements, contextOf(all), base);
    fs.mkdirSync(path.join(root(), PARTS_DIR), { recursive: true });
    fs.writeFileSync(path.join(root(), CHANGED_FILE), text);
    return scope.requirements.length
        ? `${scope.requirements.length} requirement(s) in scope against ${base} → ${CHANGED_FILE}:\n${scope.requirements.map((r) => `- ${idOf(r)}`).join('\n')}\n`
        : `Nothing in scope against ${base}; ${CHANGED_FILE} says so.\n`;
}
