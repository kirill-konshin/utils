/**
 * The change gates — the corpus checks spec-steward does not own, because they are about OpenSpec's change
 * folders rather than the specifications: every archived change is well-formed, no `skip_specs` change carries a
 * delta, and every delta a branch touches names standing requirements. `spec-tools gates` runs them after
 * spec-steward's check; statements about repository state, never a unit test. Whether the branch's WORKFLOW is
 * finished is `workflowEvidence`'s question, kept out of here so a change mid-workflow reads green.
 *
 * The module also holds the change and specification parsing the other commands share — `spec-diff`,
 * `workflowEvidence` and the audit's affected set. Anchors are spec-steward's `slugify`, so a heading cited by a test
 * and a heading the diff renders are the same slug.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { slugify } from '../../skills/spec-steward/scripts/lib/util.mjs';
import { gateBase } from './ci';
import { git, root } from './repo';

/** Every capability specification in the working tree, with its requirement and scenario headings. */
export function capabilitySpecs() {
    const base = path.join(root(), 'openspec/specs');
    const walk = (dir: string): string[] =>
        fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
            const full = path.join(dir, entry.name);
            return entry.isDirectory() ? walk(full) : entry.name === 'spec.md' ? [full] : [];
        });
    return walk(base).map((file) => {
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        const headingsAt = (depth: number, kind: string) =>
            lines.flatMap((line, i) => {
                const m = new RegExp(`^#{${depth}} (${kind}: .+)$`).exec(line);
                return m
                    ? [{ heading: m[1], name: m[1].slice(kind.length + 2), line: i + 1, slug: slugify(m[1]) }]
                    : [];
            });
        const requirements = headingsAt(3, 'Requirement');
        const scenarios = headingsAt(4, 'Scenario');
        return {
            capability: path.relative(base, path.dirname(file)),
            file: path.relative(root(), file),
            requirements,
            scenarios,
        };
    });
}

/** One requirement as a specification text carries it: its heading, slug, line and verbatim block. */
export type RequirementBlock = {
    readonly file: string;
    readonly capability: string;
    readonly name: string;
    readonly slug: string;
    readonly line: number;
    readonly block: string;
};

/**
 * The requirement blocks of one specification text — heading to the line before the next requirement, trailing
 * blank lines trimmed — so a block read at a git ref compares equal to the same block read from disk.
 */
export function requirementBlocks(file: string, text: string): RequirementBlock[] {
    const lines = text.split('\n');
    const starts = lines.flatMap((line, i) => (/^### Requirement: .+$/.test(line) ? [i] : []));
    const capability = path.dirname(file).replace(/^openspec\/specs\//, '');
    return starts.map((start, n) => {
        const body = lines.slice(start, starts[n + 1] ?? lines.length);
        while (body.length && body[body.length - 1]!.trim() === '') body.pop();
        const heading = lines[start]!.slice('### '.length);
        return {
            file,
            capability,
            name: heading.slice('Requirement: '.length),
            slug: slugify(heading),
            line: start + 1,
            block: body.join('\n'),
        };
    });
}

/** A requirement block with its whitespace collapsed, so two spellings of the same text compare equal. */
export const normalizeBlock = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * The specification files git sees renamed between a ref and the working tree, base path to head path. A capability
 * that moved is the same capability under a new path, so every comparison against a base reads it there.
 */
export function specMovesSince(ref: string, rootDir: string = root()): Map<string, string> {
    const moves = new Map<string, string>();
    for (const line of git(['diff', '-M', '--name-status', ref, '--', 'openspec/specs'], rootDir).split('\n')) {
        const [kind, from, to] = line.split('\t');
        if (kind?.startsWith('R') && from?.endsWith('/spec.md') && to) moves.set(from, to);
    }
    return moves;
}

/** The specification files at a git ref, each with its text there, addressed by its path in the working tree. */
function specsAt(ref: string, rootDir: string = root()): { file: string; text: string }[] {
    const moves = specMovesSince(ref, rootDir);
    return git(['ls-tree', '-r', '--name-only', ref, '--', 'openspec/specs'], rootDir)
        .split('\n')
        .filter((file) => file.endsWith('/spec.md'))
        .map((file) => ({ file: moves.get(file) ?? file, text: git(['show', `${ref}:${file}`], rootDir) }));
}

/** Every requirement in the specifications as they stand at a git ref — the base `spec-diff` renders against. */
export function requirementsAt(ref: string): RequirementBlock[] {
    return specsAt(ref).flatMap(({ file, text }) => requirementBlocks(file, text));
}

/**
 * Archived changes that are not evidence the workflow ran. Read from the FILESYSTEM, not the git index: git cannot
 * track an empty directory, so a change folder emptied on disk is invisible to every gate built on `git diff` —
 * which is how two of them survived unnoticed for five days.
 */
export function malformedArchivedChanges(rootDir: string = root()) {
    const base = path.join(rootDir, 'openspec/changes/archive');
    if (!fs.existsSync(base)) return [];
    return fs
        .readdirSync(base, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => {
            const dir = path.join(base, entry.name);
            const missing = ['.openspec.yaml', 'proposal.md'].filter((file) => !fs.existsSync(path.join(dir, file)));
            if (missing.length) return [`${entry.name} — missing ${missing.join(' and ')}`];
            // A delta directory that carries no specification is a merge that silently dropped one.
            const specs = path.join(dir, 'specs');
            if (fs.existsSync(specs)) {
                const walk = (current: string): string[] =>
                    fs.readdirSync(current, { withFileTypes: true }).flatMap((child) => {
                        const full = path.join(current, child.name);
                        return child.isDirectory() ? walk(full) : child.name.endsWith('.md') ? [full] : [];
                    });
                if (walk(specs).length === 0) return [`${entry.name} — carries a specs/ tree with no delta file`];
            }
            return [];
        });
}

/**
 * Unarchived changes whose deltas are already live in the standing specs — synced but not archived. A MODIFIED
 * header is always present in main (it modifies an existing requirement), so only ADDED and REMOVED are decidable
 * by heading: an ADDED requirement found in main, or a REMOVED one gone from it, means the sync ran. That state is
 * legitimate on a branch (sync, push, watch CI go green) and unfinished on a merge request, which is why
 * `workflowEvidence` — the merge-request gate — reads it and the change gates do not.
 */
export function syncedUnarchivedChanges(rootDir: string = root()) {
    const changes = path.join(rootDir, 'openspec/changes');
    if (!fs.existsSync(changes)) return [];
    const walk = (dir: string): string[] =>
        fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
            const full = path.join(dir, entry.name);
            return entry.isDirectory() ? walk(full) : entry.name === 'spec.md' ? [full] : [];
        });
    const section = (text: string, op: 'ADDED' | 'REMOVED' | 'MODIFIED') => {
        const start = text.indexOf(`## ${op} Requirements`);
        if (start < 0) return '';
        const rest = text.slice(start + 1);
        const end = rest.search(/^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements/m);
        return end < 0 ? rest : rest.slice(0, end);
    };
    const headers = (text: string) => [...text.matchAll(/^### Requirement: (.+)$/gm)].map((m) => m[1].trim());
    /** A requirement's block by heading, whitespace-normalized, so a synced MODIFIED delta compares equal to main. */
    const block = (text: string, h: string) => {
        const start = text.indexOf(`### Requirement: ${h}`);
        if (start < 0) return undefined;
        const rest = text.slice(start);
        const end = rest.search(/\n#{2,3} /);
        return normalizeBlock(end < 0 ? rest : rest.slice(0, end));
    };

    return fs
        .readdirSync(changes, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== 'archive')
        .flatMap((entry) => {
            const specs = path.join(changes, entry.name, 'specs');
            if (!fs.existsSync(specs)) return [];
            return walk(specs).flatMap((delta) => {
                const capability = path.relative(specs, path.dirname(delta));
                const main = path.join(rootDir, 'openspec/specs', capability, 'spec.md');
                if (!fs.existsSync(main)) return [];
                const text = fs.readFileSync(delta, 'utf8');
                const live = fs.readFileSync(main, 'utf8');
                const present = (h: string) => live.includes(`### Requirement: ${h}`);
                return [
                    ...headers(section(text, 'ADDED'))
                        .filter(present)
                        .map((h) => `${entry.name} — ADDED "${h}" is already in ${capability}`),
                    ...headers(section(text, 'REMOVED'))
                        .filter((h) => !present(h))
                        .map((h) => `${entry.name} — REMOVED "${h}" is already gone from ${capability}`),
                    // A MODIFIED delta is synced when main's block already reads exactly as the delta's.
                    ...headers(section(text, 'MODIFIED'))
                        .filter((h) => present(h) && block(text, h) === block(live, h))
                        .map((h) => `${entry.name} — MODIFIED "${h}" already reads as ${capability} does`),
                ];
            });
        });
}

/** Every open change — a directory under `openspec/changes/` other than the archive. */
export function openChanges(rootDir: string = root()): string[] {
    const changes = path.join(rootDir, 'openspec/changes');
    if (!fs.existsSync(changes)) return [];
    return fs
        .readdirSync(changes, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== 'archive')
        .map((entry) => entry.name)
        .sort();
}

/**
 * Open changes still carrying delta files. A change that takes the delta flow is finished inside its merge request —
 * archived, its deltas folded — and never merges half-done: deltas left open drift from the standing specifications
 * the longer they sit. Read from the filesystem so an unstaged delta counts too; a parked proposal is `skip_specs`
 * and carries none.
 */
export function deltaFilesInOpenChanges(rootDir: string = root()): string[] {
    const changes = path.join(rootDir, 'openspec/changes');
    const walk = (dir: string): string[] =>
        fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
            const full = path.join(dir, entry.name);
            return entry.isDirectory() ? walk(full) : entry.name.endsWith('.md') ? [full] : [];
        });
    return openChanges(rootDir).flatMap((change) => {
        const specs = path.join(changes, change, 'specs');
        if (!fs.existsSync(specs)) return [];
        const deltas = walk(specs).map((f) => path.relative(path.join(changes, change), f));
        return deltas.length ? [`${change} — carries ${deltas.length} delta file(s): ${deltas.join(', ')}`] : [];
    });
}

/**
 * The open changes this tree touches against a base — files changed or untracked under their directories. On the
 * default branch itself nothing is touched, which keeps a stale change failing its own pipeline and no one else's.
 */
export function touchedOpenChanges(base: string, rootDir: string = root()): string[] {
    const files = [
        ...git(['diff', '--name-only', base, '--', 'openspec/changes'], rootDir).split('\n'),
        ...git(['ls-files', '--others', '--exclude-standard', '--', 'openspec/changes'], rootDir).split('\n'),
    ];
    const names = new Set<string>();
    for (const file of files) {
        const m = /^openspec\/changes\/([^/]+)\//.exec(file);
        if (m && m[1] !== 'archive') names.add(m[1]!);
    }
    return [...names].filter((name) => fs.existsSync(path.join(rootDir, 'openspec/changes', name))).sort();
}

/**
 * Delta headings that name no standing requirement: a `MODIFIED` or `REMOVED` heading, or a `RENAMED` FROM, that the
 * standing specification does not carry — the change was written against a requirement another change has since
 * renamed or removed, and OpenSpec's own validation lets it through. Judged over the changes named only: a synced
 * change's REMOVED and RENAMED headings are legitimately gone, so callers leave synced changes out.
 */
export function staleDeltaTargets(changes: readonly string[], rootDir: string = root()): string[] {
    const walk = (dir: string): string[] =>
        fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
            const full = path.join(dir, entry.name);
            return entry.isDirectory() ? walk(full) : entry.name === 'spec.md' ? [full] : [];
        });
    const hits: string[] = [];
    for (const change of changes) {
        const specs = path.join(rootDir, 'openspec/changes', change, 'specs');
        if (!fs.existsSync(specs)) continue;
        for (const delta of walk(specs)) {
            const capability = path.relative(specs, path.dirname(delta));
            const standing = path.join(rootDir, 'openspec/specs', capability, 'spec.md');
            const headings = new Set(
                fs.existsSync(standing)
                    ? [...fs.readFileSync(standing, 'utf8').matchAll(/^### Requirement: (.+)$/gm)].map((m) =>
                          m[1]!.trim(),
                      )
                    : [],
            );
            let section = '';
            for (const line of fs.readFileSync(delta, 'utf8').split('\n')) {
                const s = /^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements/.exec(line);
                if (s) {
                    section = s[1]!;
                    continue;
                }
                let name: string | undefined;
                if (section === 'MODIFIED' || section === 'REMOVED')
                    name = /^### Requirement: (.+)$/.exec(line)?.[1]?.trim();
                else if (section === 'RENAMED') name = /^- FROM: `### Requirement: (.+)`\s*$/.exec(line)?.[1]?.trim();
                if (name !== undefined && !headings.has(name)) {
                    hits.push(
                        `${change}: ${capability} ${section}${section === 'RENAMED' ? ' FROM' : ''} "${name}" names no standing requirement`,
                    );
                }
            }
        }
    }
    return hits;
}

/**
 * A change that declares `skip_specs: true` while carrying delta files. `skip_specs` tells archive to skip the spec
 * merge; on a change that HAS deltas that is silent data loss — the folder moves to the archive and the standing
 * specs never receive them. OpenSpec has no guard for it, so it is one here, read from the filesystem so an unstaged
 * delta counts too. It guards after sync as much as at archive: a change that carries deltas never sets `skip_specs`,
 * whatever state its workflow is in.
 */
export function skipSpecsWithDeltas(rootDir: string = root()) {
    const changes = path.join(rootDir, 'openspec/changes');
    if (!fs.existsSync(changes)) return [];
    const walk = (dir: string): string[] =>
        fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
            const full = path.join(dir, entry.name);
            return entry.isDirectory() ? walk(full) : entry.name.endsWith('.md') ? [full] : [];
        });
    const dirs = (dir: string) => fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
    // Open changes and archived ones alike: the archive is where the loss would already have happened.
    const candidates = dirs(changes).flatMap((e) =>
        e.name === 'archive'
            ? dirs(path.join(changes, 'archive')).map((a) => path.join(changes, 'archive', a.name))
            : [path.join(changes, e.name)],
    );
    return candidates.flatMap((dir) => {
        const cfg = path.join(dir, '.openspec.yaml');
        if (!fs.existsSync(cfg) || !/^\s*skip_specs:\s*true/m.test(fs.readFileSync(cfg, 'utf8'))) return [];
        const specs = path.join(dir, 'specs');
        if (!fs.existsSync(specs) || walk(specs).length === 0) return [];
        return [
            `${path.relative(changes, dir)} sets skip_specs: true but carries delta files — archive would discard them`,
        ];
    });
}

/** A gate names what must hold and returns every violation; an empty list is a pass. */
type Gate = { readonly name: string; readonly run: () => string[]; readonly hint?: string };

/** The change gates over this tree, and the warnings that fail nothing. */
export function main(env: NodeJS.ProcessEnv = process.env): number {
    const synced = new Set(syncedUnarchivedChanges().map((s) => s.split(' — ')[0]!));
    // What this branch touches, judged against its merge base; a synced change's deltas are applied already.
    const touched = ((): string[] | string => {
        try {
            const base = gateBase(env);
            return base === null ? [] : touchedOpenChanges(base).filter((change) => !synced.has(change));
        } catch (error) {
            return `no base to judge the touched changes against: ${(error as Error).message.split('\n')[0]}`;
        }
    })();
    const gates: Gate[] = [
        {
            name: 'every archived change carries its schema marker, its proposal, and any delta it claims',
            run: malformedArchivedChanges,
        },
        {
            name: 'no change sets skip_specs while carrying delta files',
            run: skipSpecsWithDeltas,
            hint: 'remove skip_specs, or delete the deltas if the change really specifies nothing',
        },
        {
            name: 'every delta this branch touches names standing requirements (MODIFIED, REMOVED, RENAMED FROM)',
            run: () => (typeof touched === 'string' ? [touched] : staleDeltaTargets(touched)),
            hint: "another change renamed or removed the requirement — rebase the delta onto its successors; that change's design names them",
        },
    ];
    let failed = 0;
    for (const gate of gates) {
        const violations = gate.run();
        if (violations.length === 0) {
            console.log(`  ok    ${gate.name}`);
            continue;
        }
        failed += 1;
        console.log(`  FAIL  ${gate.name}`);
        for (const v of violations) console.log(`          ${v}`);
        if (gate.hint) console.log(`          → ${gate.hint}`);
    }
    // An untouched change's stale deltas are a warning here and a failure in its own pipeline.
    const untouched =
        typeof touched === 'string'
            ? []
            : staleDeltaTargets(openChanges().filter((change) => !synced.has(change) && !touched.includes(change)));
    console.log(`\n  WARN  ${untouched.length} — stale deltas in untouched changes`);
    for (const w of untouched) console.log(`          ${w}`);
    console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${gates.length - failed}/${gates.length} change gates hold`);
    return failed === 0 ? 0 : 1;
}
