/**
 * spec-steward — deterministic support for writing, guarding and auditing an OpenSpec corpus. It runs as
 * `spec-tools steward <command>`, the one `spec-tools` bin of `@kirill.konshin/lint`; repositories call the CLI and read
 * its JSON, never its modules.
 *
 *   spec-tools steward check     [--base auto|<ref>] [--binds <glob>]... [--file f] [--fix] [--strict] [--json]
 *                                [--max-words P,F] [--max-obligations P,F]   the corpus gate (also local and the hook)
 *   spec-tools steward coverage  [--out file] [--binds <glob>]...           the coverage report, MDX-safe Markdown
 *   spec-tools steward evidence  --json [--binds <glob>]...                  the audits' evidence model on stdout
 *   spec-tools steward review    render|status|verify|lint ...               the review-file engine
 *   spec-tools steward align     --root A=path --root B=path [--json]        wording drift of shared rules across repos
 *   spec-tools steward wire      [--check|--fix]                             the guard's steering points in a repository
 *   spec-tools steward hook                                                  Claude Code PostToolUse entry (stdin JSON)
 *
 * Common flags: --root NAME=path (repeatable), --specs <dir> (default openspec/specs). A repository's own binds live in its
 * root package.json, `"spec-steward": { "binds": [...] }`, and add to every `--binds` given.
 * Exit: 0 clean; 1 an error finding (or a warning under --strict); 2 a usage or environment error — an unknown flag,
 * a base ref that does not exist, a git listing that fails or is empty, a missing specs directory.
 */
import fs from 'node:fs';
import path from 'node:path';

import type { Finding } from './lib/checks';
import {
    applyFixes,
    baseIndex,
    checkCorpus,
    DIFF_KINDS,
    diffCorpus,
    renameFindings,
    scopePrompts,
    SIZE,
} from './lib/checks';
import { scanCitations } from './lib/citations';
import { DEFAULT_SPECS_DIR, loadCorpus, loadCorpusAt, parseSpec } from './lib/corpus';
import { coverageReport } from './lib/coverage';
import { evidenceModel, sourceIndex } from './lib/evidence';
import { changedFiles, forget, listFiles, resolveBase, toplevel } from './lib/git';
import { parseArgs } from './lib/util';

const anchorsOf = (text: string) => parseSpec(text, '', '').slugs;

/** Flags each command accepts; review, align, wire and hook read their own. */
const FLAGS = {
    check: ['base', 'binds', 'file', 'fix', 'strict', 'json', 'max-words', 'max-obligations', 'all-citations'],
    coverage: ['out', 'binds'],
    evidence: ['json', 'binds'],
};
const COMMON = ['root', 'specs'];
const BOOLEANS = ['fix', 'strict', 'json', 'all-citations', 'check'];

/** A usage or environment error: reported on stderr, exit 2. */
class UsageError extends Error {}

/** The roots the flags name, or the repository of `cwd`. */
export function rootsOf(opts: Record<string, any>, cwd: string = process.cwd()) {
    const specsDir = opts.specs ?? DEFAULT_SPECS_DIR;
    const given = (opts.root ?? []) as string[];
    if (!given.length) {
        const top = fs.realpathSync(toplevel(cwd) ?? cwd);
        return [{ name: path.basename(top), path: top, specsDir }];
    }
    return given.map((r) => {
        const eq = r.indexOf('=');
        const p = fs.realpathSync(path.resolve(cwd, eq > 0 ? r.slice(eq + 1) : r));
        return { name: eq > 0 ? r.slice(0, eq) : path.basename(p), path: p, specsDir };
    });
}

/** A `P,F` pair of size lines, or the default. */
function pair(value: unknown, fallback: [number, number]) {
    if (value === undefined) return fallback;
    const [p, f] = String(value).split(',').map(Number);
    if (!Number.isFinite(p) || (f !== undefined && !Number.isFinite(f)))
        throw new UsageError(`bad size line: ${value}`);
    return [p, f ?? fallback[1]] as [number, number];
}

/** The repository must hold a specs directory and a non-empty git listing; otherwise every scan would be vacuous. */
function assertScannable(root: { name: string; path: string; specsDir: string }) {
    if (!fs.existsSync(path.join(root.path, root.specsDir)))
        throw new UsageError(`${root.name}: no specs directory ${root.specsDir}`);
    if (!listFiles(root.path)?.length)
        throw new UsageError(`${root.name}: git lists no files — is ${root.path} a repository?`);
}

/**
 * What binds beyond the defaults: the repository's own `binds` (`"spec-steward": { "binds": [...] }` in its root
 * `package.json`), then every `--binds` given.
 */
const bindsOf = (opts: Record<string, any>, root: string) => {
    let configured = [];
    try {
        configured = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))['spec-steward']?.binds ?? [];
    } catch {
        // no package.json, or not JSON: nothing configured
    }
    return [...[].concat(configured), ...[].concat(opts.binds ?? [])].filter((b) => typeof b === 'string') as string[];
};

/** Every finding for one repository, and the base it was judged against. */
export function runCheck(root: { name: string; path: string; specsDir: string }, opts: Record<string, any>) {
    forget();
    assertScannable(root);
    let base = null;
    let how = 'none — no --base';
    if (opts.base !== undefined) {
        const resolved = resolveBase(root.path, opts.base);
        if ('error' in resolved) throw new UsageError(resolved.error);
        base = resolved.ref;
        how = resolved.how;
    }
    const corpus = loadCorpus(root.path, root);
    const binds = bindsOf(opts, root.path);
    if (opts.file && (typeof opts.file !== 'string' || !fs.existsSync(path.resolve(opts.file))))
        throw new UsageError(`--file ${opts.file}: no such file`);
    const relative = (f: string) =>
        path
            .relative(root.path, fs.realpathSync(path.resolve(f)))
            .split(path.sep)
            .join('/');
    const only = opts.file ? new Set([relative(opts.file)]) : undefined;
    const all = scanCitations(root.path, anchorsOf, { binds });
    const citations = only && !opts['all-citations'] ? all.filter((c) => only.has(c.file)) : all;
    const baseCorpus = base ? loadCorpusAt(root.path, base, root) : null;
    const index = baseCorpus ? baseIndex(baseCorpus) : null;
    let findings = checkCorpus(corpus, all, {
        maxWords: pair(opts['max-words'], SIZE.words),
        maxObligations: pair(opts['max-obligations'], SIZE.obligations),
        files: only,
        base: index,
    });
    if (baseCorpus && index && base) {
        const { findings: diff, renames } = diffCorpus(baseCorpus, corpus);
        findings.push(...diff.filter((f) => !only || only.has(f.file)));
        const renamed = renameFindings(renames, citations);
        const covered = new Set(renamed.map((f) => `${f.file}:${f.line}`));
        findings = findings.filter((f) => f.kind !== 'dangling-citation' || !covered.has(`${f.file}:${f.line}`));
        findings.push(...renamed);
        findings = scopePrompts(findings, corpus, index, changedFiles(root.path, base));
    } else if (opts.base !== undefined) findings = findings.filter((f) => f.severity !== 'info');
    return { corpus, citations, findings, base, how };
}

const ORDER = { error: 0, warn: 1, info: 2 };

function validateFlags(cmd: string, opts: Record<string, any>) {
    const known = (FLAGS as Record<string, string[]>)[cmd];
    if (!known) return;
    const unknown = Object.keys(opts).filter((k) => k !== '_' && !known.includes(k) && !COMMON.includes(k));
    if (unknown.length) throw new UsageError(`${cmd}: unknown flag ${unknown.map((k) => `--${k}`).join(', ')}`);
}

function oneRoot(roots: { name: string }[], cmd: string) {
    if (roots.length !== 1) throw new UsageError(`${cmd} takes one --root`);
    return roots[0] as { name: string; path: string; specsDir: string };
}

/** The audits' evidence model of one root. */
export function evidenceAt(root: { name: string; path: string; specsDir: string }, opts: Record<string, any> = {}) {
    assertScannable(root);
    return evidenceModel(
        loadCorpus(root.path, root),
        scanCitations(root.path, anchorsOf, { binds: bindsOf(opts, root.path) }),
        sourceIndex(root.path),
    );
}

async function main(argv: string[], cwd: string) {
    const [cmd, ...rest] = argv;
    const opts = parseArgs(rest, ['root', 'lens', 'binds'], BOOLEANS);
    validateFlags(cmd, opts);
    const roots = rootsOf(opts, cwd);

    if (cmd === 'check') {
        let failed = false;
        const all: (Pick<Finding, 'file' | 'line' | 'severity' | 'kind' | 'id' | 'message'> & { root: string })[] = [];
        const prefix = roots.length > 1;
        for (const root of roots) {
            const { how, base, ...run } = runCheck(root, opts);
            let { findings } = run;
            if (opts.fix) {
                const changed = applyFixes(root.path, findings);
                for (const f of changed) process.stderr.write(`fixed ${root.name} ${f}\n`);
                if (changed.length) findings = runCheck(root, { ...opts, fix: false }).findings;
            }
            process.stderr.write(`${prefix ? `${root.name} ` : ''}base: ${base ? `${base} (${how})` : how}\n`);
            if (!base && opts.base !== undefined)
                process.stderr.write(`  skipped: ${DIFF_KINDS.join(', ')}; prompts not printed\n`);
            findings.sort(
                (a, b) => ORDER[a.severity] - ORDER[b.severity] || a.file.localeCompare(b.file) || a.line - b.line,
            );
            for (const f of findings)
                all.push({
                    root: root.name,
                    file: f.file,
                    line: f.line,
                    severity: f.severity,
                    kind: f.kind,
                    ...(f.id && { id: f.id }),
                    message: f.message,
                });
            if (findings.some((f) => f.severity === 'error' || (opts.strict && f.severity === 'warn'))) failed = true;
        }
        if (opts.json) process.stdout.write(JSON.stringify(all, null, 2) + '\n');
        else
            for (const f of all)
                process.stdout.write(
                    `${prefix ? `${f.root} ` : ''}${f.file}:${f.line} ${f.severity} ${f.kind} ${f.message}\n`,
                );
        const by = all.reduce((m, f) => ((m[f.kind] = (m[f.kind] ?? 0) + 1), m), {} as Record<string, number>);
        const n = (s: string) => all.filter((f) => f.severity === s).length;
        process.stderr.write(
            `${all.length} finding(s): ${
                Object.entries(by)
                    .map(([k, c]) => `${k} ${c}`)
                    .join(', ') || 'none'
            }\n${failed ? 'FAIL' : 'PASS'} — ${n('error')} error(s), ${n('warn')} warning(s), ${n('info')} prompt(s)\n`,
        );
        return failed ? 1 : 0;
    }

    if (cmd === 'coverage') {
        const root = oneRoot(roots, cmd);
        assertScannable(root);
        const { markdown, totals } = coverageReport(
            loadCorpus(root.path, root),
            scanCitations(root.path, anchorsOf, { binds: bindsOf(opts, root.path) }),
        );
        if (typeof opts.out === 'string') {
            fs.writeFileSync(path.resolve(opts.out), markdown);
            process.stderr.write(
                `wrote ${opts.out} — ${totals.requirements} requirements, ${totals.unboundRequirements} REQUIRED unbound, ${totals.gaps} known gaps\n`,
            );
        } else process.stdout.write(markdown);
        return 0;
    }

    if (cmd === 'evidence') {
        if (!opts.json) throw new UsageError('evidence takes --json: the evidence model on stdout');
        process.stdout.write(JSON.stringify(evidenceAt(oneRoot(roots, cmd), opts)) + '\n');
        return 0;
    }

    if (cmd === 'review') return (await import('./lib/review')).reviewCli(rest, roots);
    if (cmd === 'align') return (await import('./lib/align')).alignCli(opts, roots);
    if (cmd === 'wire') return (await import('./lib/wire')).wireCli(opts, roots[0]);
    if (cmd === 'hook') return (await import('./lib/wire')).hookCli(opts);

    throw new UsageError(
        'usage: spec-tools steward check|coverage|evidence|review|align|wire|hook — see the spec-steward skill',
    );
}

/**
 * `spec-tools steward <argv>` in the repository of `cwd`: its exit code. A usage error is reported, exit 2; outside CI
 * a command other than `hook` and `wire` first warns when the guard is not fully wired, and that check never blocks.
 */
export async function run(argv: string[], cwd: string = process.cwd()) {
    const [cmd, ...rest] = argv;
    if (cmd && cmd !== 'hook' && cmd !== 'wire' && !process.env.CI) {
        try {
            const { wireWarning } = await import('./lib/wire');
            const warning = wireWarning(rootsOf(parseArgs(rest, ['root']), cwd)[0]);
            if (warning) process.stderr.write(warning + '\n');
        } catch {
            // the wire check never blocks a command
        }
    }
    try {
        return await main(argv, cwd);
    } catch (error) {
        if (!(error instanceof UsageError)) throw error;
        process.stderr.write(`spec-tools steward: ${error.message}\n`);
        return 2;
    }
}
