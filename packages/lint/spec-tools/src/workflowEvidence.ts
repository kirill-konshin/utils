/**
 * Is this merge request finished? The one gate whose red says "not yet". A change that takes the
 * delta flow is finished inside its merge request — archived, its deltas folded into the standing
 * specifications, its folder moved — and never merges half-done: deltas left open drift from the
 * specifications the longer they sit, which is how two changes reached `main` with their code
 * merged and their deltas never folded. The diff cannot see either state; the tree can:
 *
 * - an open change still carrying delta files, synced or not (`deltaFilesInOpenChanges`);
 * - an open change whose deltas are already live in `openspec/specs/` — synced but not archived
 *   (`syncedUnarchivedChanges`) — which an emptied `specs/` folder would otherwise hide.
 *
 * A direct edit of `openspec/specs/` is not this gate's business: it needs no archive and is
 * reviewed as the merge request's diff, which `spec-tools diff` renders by requirement.
 *
 * Both live here and not in the corpus gates, so a branch mid-delta-flow reads red on exactly this gate
 * and green on everything else — the audits included, which depend on no gate.
 *
 * With `--classify` it answers the audit's run-class question instead (`spec-tools tier`): which kind of open
 * change the branch touches against its base — `deltas` (one carrying deltas, or synced but not archived),
 * `skip-specs` (one carrying none) or `none` — printed as the last line.
 *
 * Usage: `spec-tools evidence` | `spec-tools evidence --classify`
 */
import { deltaFilesInOpenChanges, syncedUnarchivedChanges, touchedOpenChanges } from './changeGates';
import { gateBase } from './ci';

export type Evidence = {
    /** Open changes carrying delta files, as `deltaFilesInOpenChanges` reports them. */
    readonly openDeltas: readonly string[];
    /** Open changes whose deltas are already live, as `syncedUnarchivedChanges` reports them. */
    readonly syncedUnarchived: readonly string[];
};

/** The gate's decision, kept pure so it can be tested without a repository. */
export function workflowEvidence(input: Evidence): string | null {
    const errors: string[] = [];
    if (input.openDeltas.length > 0) {
        errors.push(
            'ERROR: an open change still carries delta files:',
            ...input.openDeltas.map((line) => `  ${line}`),
            '',
            'A change with deltas is finished inside its merge request: archive it (/opsx:archive) before it merges.',
            'A parked proposal is skip_specs and carries no delta; a small change edits openspec/specs/ directly.',
        );
    }
    if (input.syncedUnarchived.length > 0) {
        if (errors.length > 0) errors.push('');
        errors.push(
            'ERROR: an open change already has its deltas live in openspec/specs/ (synced but not archived):',
            ...input.syncedUnarchived.map((line) => `  ${line}`),
            '',
            'This branch is unfinished: archive the change (/opsx:archive) before it merges.',
        );
    }
    return errors.length === 0 ? null : [...errors, '', 'See AGENTS.md, "Making a change".'].join('\n');
}

export type OpenChangeClass = 'deltas' | 'skip-specs' | 'none';

/**
 * The kind of open change a branch touches: `deltas` when one of them carries deltas or is synced but not archived —
 * the merge this gate blocks — `skip-specs` when it touches open changes carrying none, `none` when it touches none.
 */
export function classify(touched: readonly string[], input: Evidence): OpenChangeClass {
    const name = (line: string) => line.split(' — ')[0]!;
    const withDeltas = new Set([...input.openDeltas, ...input.syncedUnarchived].map(name));
    if (touched.some((change) => withDeltas.has(change))) return 'deltas';
    return touched.length > 0 ? 'skip-specs' : 'none';
}

/** `spec-tools evidence [--classify]`: the workflow-evidence gate, or with `--classify` the open changes a branch touches. */
export function cli(argv: readonly string[]): number {
    const openDeltas = deltaFilesInOpenChanges();
    const syncedUnarchived = syncedUnarchivedChanges();
    if (argv.includes('--classify')) {
        const base = gateBase();
        const touched = base === null ? [] : touchedOpenChanges(base);
        console.log(`open changes this branch touches against ${base ?? 'no base'}: ${touched.join(', ') || 'none'}`);
        console.log(classify(touched, { openDeltas, syncedUnarchived }));
        return 0;
    }
    console.log(
        `open changes carrying deltas: ${openDeltas.length}, open changes already synced: ${syncedUnarchived.length}`,
    );
    const violation = workflowEvidence({ openDeltas, syncedUnarchived });
    if (violation) {
        console.error(violation);
        return 1;
    }
    console.log('PASS — no open change carries deltas, and none is synced but unarchived');
    return 0;
}
