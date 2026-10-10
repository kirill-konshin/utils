/**
 * `spec-tools audit`: the CI sequence — the evidence model, scope, then the passes and merges in the order `workers.ts`
 * describes — run by default from a DETACHED worktree of HEAD, so what is judged is exactly the commit CI judges: an
 * uncommitted edit, or a stale `audit-parts/findings/` in the working tree, cannot leak into the run, and every ERROR's
 * quotes are re-proved against HEAD. The install is the working tree's (`node_modules` is linked in), and the run's
 * outputs — evidence model, scope, evidence, findings, the merged report — come back to the working tree.
 * `--here` runs on the working tree instead, uncommitted edits included, and re-proves quotes against it.
 * `--dry` exercises the tree and runs no worker.
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { AUDIT_FILES, type AuditName, EVIDENCE_FILE, PARTS_DIR } from './files';
import { git, root } from './repo';

/** What a run produces and brings back to the working tree. */
const outputs = (audit: AuditName) => [
    ...new Set([
        EVIDENCE_FILE,
        PARTS_DIR,
        AUDIT_FILES[audit].scope,
        AUDIT_FILES[audit].report,
        AUDIT_FILES[audit].data,
    ]),
];

/** This CLI as it was started — the build or the source under a loader alike — run in `cwd`; its exit code. */
const self = (args: readonly string[], cwd: string): number =>
    spawnSync(process.execPath, [...process.execArgv, process.argv[1]!, ...args], { cwd, stdio: 'inherit' }).status ??
    1;

/**
 * The sequence in one tree. The intermediate merges only render; spec-verify's last one gates (exit 0 / 1 / 3), and
 * spec-steward's renders the review file for the owner.
 */
function sequence(tree: string, here: boolean, dry: boolean, audit: AuditName, context?: string): number {
    const named = audit === 'spec-verify' ? [] : ['--audit', audit];
    const worker = context ? [...named, '--context', context] : named;
    const report = [...(here ? ['report', '--worktree'] : ['report']), ...named];
    const steps = dry
        ? [['scope', ...named]]
        : [
              ['scope', ...named],
              ['workers', ...worker],
              report,
              ['workers', '--complete', ...worker],
              report,
              ['workers', '--verify', ...worker],
              audit === 'spec-verify' ? [...report, '--gate'] : report,
          ];
    for (const step of steps) {
        const code = self(step, tree);
        if (code !== 0) return code;
    }
    if (dry) console.log('spec-tools audit: dry run — scope written, no worker started');
    return 0;
}

export function audit(argv: readonly string[], audit: AuditName = 'spec-verify'): number {
    const valued = ['--audit', '--context'];
    const unknown = argv.filter(
        (a, i) => a !== '--here' && a !== '--dry' && !valued.includes(a) && !valued.includes(argv[i - 1] ?? ''),
    );
    if (unknown.length) {
        console.error(
            `spec-tools audit: unknown argument ${unknown[0]} (accepted: --here, --dry, --audit <name>, --context <file>)`,
        );
        return 2;
    }
    const given = argv.includes('--context') ? argv[argv.indexOf('--context') + 1] : undefined;
    // Absolute, because the passes run in a detached tree elsewhere.
    const context = given ? path.resolve(given) : undefined;
    const here = argv.includes('--here');
    const dry = argv.includes('--dry');
    const top = root();
    const head = git(['rev-parse', '--short', 'HEAD']).trim();
    if (here) {
        console.log(`spec-tools audit: working tree (${head}, uncommitted edits included)`);
        return sequence(top, true, dry, audit, context);
    }
    const tree = path.join(fs.mkdtempSync(path.join(os.tmpdir(), `${path.basename(top)}-audit-`)), 'tree');
    git(['worktree', 'add', '--detach', '--quiet', tree, 'HEAD']);
    try {
        fs.symlinkSync(path.join(top, 'node_modules'), path.join(tree, 'node_modules'));
        console.log(`spec-tools audit: detached tree of ${head} at ${tree}`);
        const code = sequence(tree, false, dry, audit, context);
        // A dry run proved the tree and leaves the working tree's last run alone.
        if (!dry)
            for (const out of outputs(audit)) {
                if (!fs.existsSync(path.join(tree, out))) continue;
                fs.rmSync(path.join(top, out), { recursive: true, force: true });
                fs.cpSync(path.join(tree, out), path.join(top, out), { recursive: true });
            }
        return code;
    } finally {
        try {
            git(['worktree', 'remove', '--force', tree]);
        } catch {
            fs.rmSync(tree, { recursive: true, force: true });
        }
    }
}
