#!/usr/bin/env node
// @ts-check
/**
 * spec-steward CLI — deterministic support for writing, guarding and auditing an OpenSpec corpus. Installed as the
 * `spec-steward` bin of `@kirill.konshin/lint`; repositories call the CLI and read its JSON, never its modules.
 *
 *   spec-steward check     [--base auto|<ref>] [--binds <glob>]... [--file f] [--fix] [--strict] [--json]
 *                          [--max-words P,F] [--max-obligations P,F]      the corpus gate (also local and the hook)
 *   spec-steward coverage  [--out file] [--binds <glob>]...              the coverage report, MDX-safe Markdown
 *   spec-steward evidence  --json [--binds <glob>]...                     the audit's evidence model on stdout
 *   spec-steward evidence  --out dir [--root NAME=path]...               per-capability evidence bundles
 *   spec-steward partition --out dir --parts N                           balanced parts over the bundles in --out
 *   spec-steward index     [--full] [--binds <glob>]...                  corpus and citation summary as JSON
 *   spec-steward review    render|status|verify|lint ...                  the review-file engine
 *   spec-steward align     --root A=path --root B=path [--json]           wording drift of shared rules across repos
 *   spec-steward wire      [--check|--fix]                                the guard's steering points in a repository
 *   spec-steward hook                                                     Claude Code PostToolUse entry (stdin JSON)
 *
 * Common flags: --root NAME=path (repeatable), --specs <dir> (default openspec/specs).
 * Exit: 0 clean; 1 an error finding (or a warning under --strict); 2 a usage or environment error — an unknown flag,
 * a base ref that does not exist, a git listing that fails or is empty, a missing specs directory.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
    applyFixes,
    baseIndex,
    checkCorpus,
    DIFF_KINDS,
    diffCorpus,
    renameFindings,
    scopePrompts,
    SIZE,
} from './lib/checks.mjs';
import { scanCitations } from './lib/citations.mjs';
import { allRequirements, DEFAULT_SPECS_DIR, loadCorpus, loadCorpusAt, parseSpec } from './lib/corpus.mjs';
import { coverageReport } from './lib/coverage.mjs';
import { capabilityEvidence, evidenceModel, partition, sourceIndex } from './lib/evidence.mjs';
import { changedFiles, forget, listFiles, resolveBase, toplevel } from './lib/git.mjs';
import { parseArgs } from './lib/util.mjs';

const anchorsOf = (/** @type {string} */ text) => parseSpec(text, '', '').slugs;

/** Flags each command accepts; review, align, wire and hook read their own. */
const FLAGS = {
    check: ['base', 'binds', 'file', 'fix', 'strict', 'json', 'max-words', 'max-obligations', 'all-citations'],
    coverage: ['out', 'binds'],
    evidence: ['out', 'json', 'binds'],
    partition: ['out', 'parts'],
    index: ['full', 'binds'],
};
const COMMON = ['root', 'specs'];
const BOOLEANS = ['fix', 'strict', 'json', 'all-citations', 'full', 'check'];

/** A usage or environment error: reported on stderr, exit 2. */
class UsageError extends Error {}

/** @param {Record<string, any>} opts */
export function rootsOf(opts) {
    const specsDir = opts.specs ?? DEFAULT_SPECS_DIR;
    const given = /** @type {string[]} */ (opts.root ?? []);
    if (!given.length) {
        const top = fs.realpathSync(toplevel(process.cwd()) ?? process.cwd());
        return [{ name: path.basename(top), path: top, specsDir }];
    }
    return given.map((r) => {
        const eq = r.indexOf('=');
        const p = fs.realpathSync(path.resolve(eq > 0 ? r.slice(eq + 1) : r));
        return { name: eq > 0 ? r.slice(0, eq) : path.basename(p), path: p, specsDir };
    });
}

/** A `P,F` pair of size lines, or the default. @param {unknown} value @param {[number, number]} fallback */
function pair(value, fallback) {
    if (value === undefined) return fallback;
    const [p, f] = String(value).split(',').map(Number);
    if (!Number.isFinite(p) || (f !== undefined && !Number.isFinite(f)))
        throw new UsageError(`bad size line: ${value}`);
    return /** @type {[number, number]} */ ([p, f ?? fallback[1]]);
}

/**
 * The repository must hold a specs directory and a non-empty git listing; otherwise every scan would be vacuous.
 * @param {{ name: string, path: string, specsDir: string }} root
 */
function assertScannable(root) {
    if (!fs.existsSync(path.join(root.path, root.specsDir)))
        throw new UsageError(`${root.name}: no specs directory ${root.specsDir}`);
    if (!listFiles(root.path)?.length)
        throw new UsageError(`${root.name}: git lists no files — is ${root.path} a repository?`);
}

/** @param {Record<string, any>} opts */
const bindsOf = (opts) => /** @type {string[]} */ ([].concat(opts.binds ?? []).filter((b) => typeof b === 'string'));

/**
 * Every finding for one repository, and the base it was judged against.
 * @param {{ name: string, path: string, specsDir: string }} root
 * @param {Record<string, any>} opts
 */
export function runCheck(root, opts) {
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
    const binds = bindsOf(opts);
    if (opts.file && (typeof opts.file !== 'string' || !fs.existsSync(path.resolve(opts.file))))
        throw new UsageError(`--file ${opts.file}: no such file`);
    const relative = (/** @type {string} */ f) =>
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

/**
 * @param {string} cmd
 * @param {Record<string, any>} opts
 */
function validateFlags(cmd, opts) {
    const known = /** @type {Record<string, string[]>} */ (FLAGS)[cmd];
    if (!known) return;
    const unknown = Object.keys(opts).filter((k) => k !== '_' && !known.includes(k) && !COMMON.includes(k));
    if (unknown.length) throw new UsageError(`${cmd}: unknown flag ${unknown.map((k) => `--${k}`).join(', ')}`);
}

/** @param {{ name: string }[]} roots @param {string} cmd */
function oneRoot(roots, cmd) {
    if (roots.length !== 1) throw new UsageError(`${cmd} takes one --root`);
    return /** @type {{ name: string, path: string, specsDir: string }} */ (roots[0]);
}

/** @param {string[]} argv */
async function main(argv) {
    const [cmd, ...rest] = argv;
    const opts = parseArgs(rest, ['root', 'lens', 'binds'], BOOLEANS);
    validateFlags(cmd, opts);
    const roots = rootsOf(opts);

    if (cmd === 'index') {
        const out = roots.map((root) => {
            assertScannable(root);
            const corpus = loadCorpus(root.path, root);
            const citations = scanCitations(root.path, anchorsOf, { binds: bindsOf(opts) });
            const reqs = allRequirements(corpus);
            const count = (/** @type {(c: import('./lib/citations.mjs').Citation) => boolean} */ p) =>
                citations.filter(p).length;
            return {
                name: root.name,
                path: root.path,
                capabilities: corpus.capabilities.length,
                requirements: reqs.length,
                advisory: reqs.filter((r) => r.advisory).length,
                gaps: reqs.reduce((n, r) => n + r.gaps.length, 0),
                scenarios: reqs.reduce((n, r) => n + r.scenarios.length, 0),
                citations: {
                    bindings: count((c) => !!c.binding),
                    pointers: count((c) => !c.binding),
                    dangling: count((c) => !c.resolves),
                },
                corpus: opts.full ? corpus.capabilities.map((c) => ({ ...c, slugs: undefined })) : undefined,
            };
        });
        process.stdout.write(JSON.stringify(out, null, 2) + '\n');
        return 0;
    }

    if (cmd === 'check') {
        let failed = false;
        const all = [];
        const prefix = roots.length > 1;
        for (const root of roots) {
            let { findings, how, base } = runCheck(root, opts);
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
        const by = all.reduce(
            (m, f) => ((m[f.kind] = (m[f.kind] ?? 0) + 1), m),
            /** @type {Record<string, number>} */ ({}),
        );
        const n = (/** @type {string} */ s) => all.filter((f) => f.severity === s).length;
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
            scanCitations(root.path, anchorsOf, { binds: bindsOf(opts) }),
        );
        if (typeof opts.out === 'string') {
            fs.writeFileSync(path.resolve(opts.out), markdown);
            process.stderr.write(
                `wrote ${opts.out} — ${totals.requirements} requirements, ${totals.unboundRequirements} REQUIRED unbound, ${totals.gaps} known gaps\n`,
            );
        } else process.stdout.write(markdown);
        return 0;
    }

    if (cmd === 'evidence' && opts.json) {
        const root = oneRoot(roots, cmd);
        assertScannable(root);
        const model = evidenceModel(
            loadCorpus(root.path, root),
            scanCitations(root.path, anchorsOf, { binds: bindsOf(opts) }),
            sourceIndex(root.path),
        );
        process.stdout.write(JSON.stringify(model) + '\n');
        return 0;
    }

    if (cmd === 'evidence') {
        const out = path.resolve(opts.out ?? 'spec-evidence');
        const corpora = roots.map((root) => {
            assertScannable(root);
            return {
                root,
                corpus: loadCorpus(root.path, root),
                citations: scanCitations(root.path, anchorsOf, { binds: bindsOf(opts) }),
                sources: sourceIndex(root.path),
            };
        });
        const everywhere = corpora.flatMap(({ corpus }) =>
            allRequirements(corpus).map((requirement) => ({ corpus, requirement })),
        );
        const bundles = [];
        for (const { root, corpus, citations, sources } of corpora) {
            for (const cap of corpus.capabilities) {
                const file = path.join(out, root.name, `${cap.capability}.md`);
                fs.mkdirSync(path.dirname(file), { recursive: true });
                const md = capabilityEvidence(corpus, cap, citations, sources, everywhere);
                fs.writeFileSync(file, md);
                bundles.push({
                    corpus: root.name,
                    capability: cap.capability,
                    file,
                    bytes: Buffer.byteLength(md),
                    requirementIds: cap.requirements.map((r) => r.id),
                });
            }
        }
        fs.writeFileSync(path.join(out, 'bundles.json'), JSON.stringify(bundles, null, 2));
        process.stderr.write(`${bundles.length} bundle(s) in ${out}\n`);
        return 0;
    }

    if (cmd === 'partition') {
        const out = path.resolve(opts.out ?? 'spec-evidence');
        const bundles = JSON.parse(fs.readFileSync(path.join(out, 'bundles.json'), 'utf8'));
        const parts = partition(bundles, Number(opts.parts ?? 16));
        fs.writeFileSync(path.join(out, 'parts.json'), JSON.stringify(parts, null, 2));
        for (const p of parts)
            process.stdout.write(`part ${p.part}: ${Math.round(p.bytes / 1024)} KB — ${p.capabilities.join(', ')}\n`);
        return 0;
    }

    if (cmd === 'review') return (await import('./lib/review.mjs')).reviewCli(rest, roots);
    if (cmd === 'align') return (await import('./lib/align.mjs')).alignCli(opts, roots);
    if (cmd === 'wire') return (await import('./lib/wire.mjs')).wireCli(opts, roots[0]);
    if (cmd === 'hook') return (await import('./lib/wire.mjs')).hookCli(opts);

    throw new UsageError(
        'usage: spec-steward check|coverage|evidence|partition|index|review|align|wire|hook — see the header of steward.mjs',
    );
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname)) {
    const cmd = process.argv[2];
    if (cmd && cmd !== 'hook' && cmd !== 'wire' && !process.env.CI) {
        try {
            const { wireWarning } = await import('./lib/wire.mjs');
            const warning = wireWarning(rootsOf(parseArgs(process.argv.slice(3), ['root']))[0]);
            if (warning) process.stderr.write(warning + '\n');
        } catch {
            // the wire check never blocks a command
        }
    }
    try {
        process.exitCode = await main(process.argv.slice(2));
    } catch (error) {
        if (!(error instanceof UsageError)) throw error;
        process.stderr.write(`spec-steward: ${error.message}\n`);
        process.exitCode = 2;
    }
}
