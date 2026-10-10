#!/usr/bin/env node
/**
 * `spec-tools <command>`: the specification tooling beside spec-steward's corpus gate — the change gates, the
 * workflow-evidence gate, the specification diff, the specification audit, and the AI-review glue a pipeline runs
 * around a headless review. Every command runs against the repository of the current directory.
 *
 *   spec-tools gates                            spec-steward's check against the merge base, then the change gates
 *   spec-tools evidence [--classify]            the workflow-evidence gate
 *   spec-tools diff [<base>]                    the specification diff, by requirement
 *   spec-tools changed                          a changed requirement's evidence, for its author
 *   spec-tools tier                             the audit's run class, as dotenv lines
 *   spec-tools scope [--audit <a>]              the audit's scope, partition and evidence
 *   spec-tools workers [--complete|--verify] [--audit <a>] [--context <file>]   one pass of the audit's workers
 *   spec-tools report [--gate] [--worktree] [--audit <a>]    the merge, and with `--gate` the verdict's exit code
 *   spec-tools audit [--here] [--dry] [--audit <a>] [--context <file>]          the whole audit locally, as CI runs it
 *
 * `--audit` names the audit: `spec-verify` (code conformance, the default) or `spec-steward` (corpus quality, whose
 * merge renders the review file `spec-review.md`). `--context <file>` puts the facts and owner decisions the file holds
 * into every worker's and verifier's brief.
 *   spec-tools run <skill> [--verdict <file>] [--advisory]   one skill-driven review, headless, and its verdict gate
 *   spec-tools verdict <file> [--log <file>] [--advisory]    the verdict gate of a review's report
 *   spec-tools comment <name>=<report.md>...    the merge-request comment of the pipeline's reviews
 *   spec-tools html <file.md>...                Markdown reports as self-contained HTML
 *
 * Exit: 0 clean; 1 a failed gate; 2 a usage error; `report --gate` and `verdict` as their headers say.
 */
import type { AuditName } from './files';

const [command, ...argv] = process.argv.slice(2);

/** The value after a flag, or undefined. */
const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
};

/** The audit `--audit` names; spec-verify when none is named. */
async function auditOf(): Promise<AuditName> {
    const name = flag('--audit') ?? 'spec-verify';
    const { AUDIT_NAMES } = await import('./files');
    if (!(AUDIT_NAMES as readonly string[]).includes(name))
        throw new Error(`--audit ${name}: expected one of ${AUDIT_NAMES.join(', ')}`);
    return name as AuditName;
}

async function main(): Promise<number> {
    switch (command) {
        case 'gates': {
            const { root } = await import('./repo');
            const checked = (await import('./steward')).steward(['check', '--base', 'auto'], root());
            const gates = (await import('./changeGates')).main();
            return Math.max(checked, gates);
        }
        case 'evidence':
            return (await import('./workflowEvidence')).cli(argv);
        case 'diff':
            console.log((await import('./specDiff')).main(argv));
            return 0;
        case 'changed': {
            const { root } = await import('./repo');
            (await import('./steward')).writeEvidence(root());
            process.stdout.write((await import('./auditChanged')).main());
            return 0;
        }
        case 'tier': {
            const { dotenv, tier } = await import('./tier');
            process.stdout.write(dotenv(tier()));
            return 0;
        }
        case 'scope': {
            const { root } = await import('./repo');
            (await import('./steward')).writeEvidence(root());
            process.stdout.write((await import('./auditScope')).main(process.env, await auditOf()));
            return 0;
        }
        case 'workers': {
            const pass = argv.includes('--verify') ? 'verify' : argv.includes('--complete') ? 'complete' : 'read';
            const file = flag('--context');
            const context = file ? (await import('node:fs')).readFileSync(file, 'utf8') : undefined;
            return (await import('./workers')).workers(pass, { audit: await auditOf(), context });
        }
        case 'report': {
            if ((await auditOf()) === 'spec-verify') return (await import('./auditReport')).cli(argv);
            const { commitReader, worktreeReader } = await import('./auditReport');
            console.log(
                (await import('./stewardAudit')).merge(argv.includes('--worktree') ? worktreeReader : commitReader),
            );
            return 0;
        }
        case 'audit':
            return (await import('./audit')).audit(argv, await auditOf());
        case 'run': {
            const skill = argv[0];
            if (!skill || skill.startsWith('-')) break;
            const { jobLog } = await import('./ci');
            const log = jobLog();
            const code = await (await import('./run')).run(skill, log);
            const report = flag('--verdict');
            if (code !== 0 || !report) return code;
            const advisory = argv.includes('--advisory') || process.env.AUDIT_GATING === 'advisory';
            return (await import('./verdict')).gate(report, log, advisory);
        }
        case 'verdict': {
            const report = argv[0];
            if (!report || report.startsWith('-')) break;
            const { jobLog } = await import('./ci');
            const advisory = argv.includes('--advisory') || process.env.AUDIT_GATING === 'advisory';
            return (await import('./verdict')).gate(report, flag('--log') ?? jobLog(), advisory);
        }
        case 'comment':
            process.stdout.write((await import('./comment')).comment(argv));
            return 0;
        case 'html':
            return (await import('./html')).html(argv);
    }
    console.error(`spec-tools: unknown or incomplete command ${[command, ...argv].join(' ') || '(none)'}`);
    return 2;
}

process.exitCode = await main();

export {};
