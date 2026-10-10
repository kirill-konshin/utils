/**
 * The reviewer's view of a specification change: the standing requirements ADDED, MODIFIED, REMOVED
 * or RENAMED between a base ref and the working tree, by `### Requirement:` heading, each with its
 * full block, and the capabilities MOVED to a new path — what a delta used to spell out by hand,
 * computed from git instead. A report, never a
 * gate: it always exits 0, writes `spec-diff.md` at the repository root and prints it, and CI
 * publishes it beside the merge request. The base is the merge request's (`diffBase`) — or `HEAD`,
 * the working tree's own edits, for an author's preview — unless a ref is given as the first argument.
 *
 * Usage: spec-tools diff [<base ref>]
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
    capabilitySpecs,
    normalizeBlock,
    type RequirementBlock,
    requirementBlocks,
    requirementsAt,
    specMovesSince,
} from './changeGates';
import { diffBase } from './ci';
import { root } from './repo';

export const DIFF_FILE = 'spec-diff.md';

export type SpecDiff = {
    readonly added: readonly RequirementBlock[];
    readonly modified: readonly { readonly before: RequirementBlock; readonly after: RequirementBlock }[];
    readonly removed: readonly RequirementBlock[];
    readonly renamed: readonly { readonly from: RequirementBlock; readonly to: RequirementBlock }[];
};

const id = (r: RequirementBlock) => `${r.file}#${r.slug}`;
/** The block without its heading line, normalized — what a rename keeps and an edit changes. */
const body = (r: RequirementBlock) => normalizeBlock(r.block.split('\n').slice(1).join('\n'));

/**
 * ADDED is a heading only the head has, REMOVED one only the base has, MODIFIED one on both sides
 * whose block differs beyond whitespace. A REMOVED and an ADDED in the same file with the same body
 * are one RENAMED, paired once each; a rename that also edits the body stays a REMOVED and an ADDED.
 */
export function classify(base: readonly RequirementBlock[], head: readonly RequirementBlock[]): SpecDiff {
    const baseById = new Map(base.map((r) => [id(r), r]));
    const headById = new Map(head.map((r) => [id(r), r]));
    let added = head.filter((r) => !baseById.has(id(r)));
    let removed = base.filter((r) => !headById.has(id(r)));
    const modified = head.flatMap((after) => {
        const before = baseById.get(id(after));
        return before && normalizeBlock(before.block) !== normalizeBlock(after.block) ? [{ before, after }] : [];
    });
    const renamed: { from: RequirementBlock; to: RequirementBlock }[] = [];
    for (const from of [...removed]) {
        const to = added.find((a) => a.file === from.file && body(a) === body(from));
        if (!to) continue;
        renamed.push({ from, to });
        added = added.filter((a) => a !== to);
        removed = removed.filter((r) => r !== from);
    }
    return { added, modified, removed, renamed };
}

/** A capability that moved: its path under `openspec/specs/` at the base and in the working tree. */
export type CapabilityMove = { readonly from: string; readonly to: string };

const capabilityOf = (file: string) => path.dirname(file).replace(/^openspec\/specs\//, '');

/** The spec files git sees renamed, as capability paths — a moved requirement is compared under its new path. */
export const capabilityMoves = (moves: ReadonlyMap<string, string>): CapabilityMove[] =>
    [...moves].map(([from, to]) => ({ from: capabilityOf(from), to: capabilityOf(to) }));

const fence = (block: string) => ['```markdown', block, '```'].join('\n');
const where = (r: RequirementBlock) => `\`${r.file}:${r.line}\``;

/** The report: a fixed first line CI can read, then one section per operation with every block in full. */
export function render(diff: SpecDiff, base: string, moved: readonly CapabilityMove[] = []): string {
    const total = diff.added.length + diff.modified.length + diff.removed.length + diff.renamed.length;
    const out = [
        `SPEC DIFF ${total} changed (${diff.added.length} added, ${diff.modified.length} modified, ${diff.removed.length} removed, ${diff.renamed.length} renamed)`,
        '',
        `Standing requirements of \`openspec/specs/\` against \`${base}\`, by heading. A report, not a gate: the reviewer's view of a specification change.`,
        '',
    ];
    if (moved.length) {
        out.push('## MOVED', '');
        for (const { from, to } of moved) out.push(`- ${from} → ${to}`);
        out.push('', 'A moved requirement is compared under its new path; one not listed below moved unchanged.', '');
    }
    if (total === 0) return [...out, 'No requirement changed.', ''].join('\n');
    if (diff.added.length) {
        out.push('## ADDED', '');
        for (const r of diff.added) out.push(`### ${r.capability}#${r.slug}`, '', where(r), '', fence(r.block), '');
    }
    if (diff.modified.length) {
        out.push('## MODIFIED', '');
        for (const { before, after } of diff.modified) {
            out.push(`### ${after.capability}#${after.slug}`, '', where(after), '', fence(after.block), '');
            out.push('<details>', '<summary>before</summary>', '', fence(before.block), '', '</details>', '');
        }
    }
    if (diff.removed.length) {
        out.push('## REMOVED', '');
        for (const r of diff.removed)
            out.push(`### ${r.capability}#${r.slug}`, '', `was ${where(r)}`, '', fence(r.block), '');
    }
    if (diff.renamed.length) {
        out.push('## RENAMED', '');
        for (const { from, to } of diff.renamed)
            out.push(`- ${from.capability}#${from.slug} → ${to.capability}#${to.slug} (${where(to)}, body unchanged)`);
        out.push('');
    }
    out.push(
        'A removed or renamed heading takes its anchor with it; `spec-tools steward check` fails every citation that no longer resolves.',
        '',
    );
    return out.join('\n');
}

/** The working tree's requirement blocks, cut by the same rule as the base's. */
export function requirementsInTree(): RequirementBlock[] {
    return capabilitySpecs().flatMap((spec) =>
        requirementBlocks(spec.file, fs.readFileSync(path.join(root(), spec.file), 'utf8')),
    );
}

/** `argv` is what follows the command — `[base]` — never the process's own arguments, which start with it. */
export function main(argv: readonly string[] = [], env = process.env): string {
    const base = argv[0] ?? diffBase(env);
    const text = render(
        classify(requirementsAt(base), requirementsInTree()),
        base,
        capabilityMoves(specMovesSince(base)),
    );
    fs.writeFileSync(path.join(root(), DIFF_FILE), text);
    return text;
}
