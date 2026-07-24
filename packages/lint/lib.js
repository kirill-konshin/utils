import { existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { includeIgnoreFile as includeIgnoreFileCompat } from '@eslint/compat';
import { findRootSync } from '@manypkg/find-root';
import { getPackagesSync } from '@manypkg/get-packages';
import { globSync } from 'glob';
import { isPackageExists } from 'local-pkg';

export const tsExtsRaw = 'js,jsx,ts,tsx,cjs,cts,mjs,mts'; // TODO mdx, needs loader
export const eslintExtsRaw = `${tsExtsRaw},md,mdx,htm,html,vue`;
export const prettierExtsRaw = 'css,scss,sass,less,yml,yaml,json,json5,jsonc,graphql,graphqls,xml';

export const tsExts = `{${tsExtsRaw}}`;
export const eslintExts = `*.{${eslintExtsRaw}}`;
export const prettierExts = `*.{${prettierExtsRaw}}`;

//TODO coverage, dist, out, build?
export const GLOBAL_IGNORES = [
    '**/next-env.d.ts',
    '**/viteEnv.d.ts',
    '**/node_modules',
    '**/.cache',
    '**/.nx',
    '**/.turbo',
    '**/.yarn',
];

const LINT_DEBUG = Boolean(process.env.LINT_DEBUG);

/**
 * Structured debug logging, gated by the `LINT_DEBUG` env var (any non-empty value). Traces the
 * detection machinery: capability probes, workspace scans and per-tool gate verdicts.
 */
function debug(message, ...args) {
    if (!LINT_DEBUG) return;
    console.log(`[@kirill.konshin/lint] ${message}`, ...args);
}

/**
 * Capability gate: is a package resolvable from the workspace root - the scope the ESLint plugins
 * themselves resolve from at lint time?
 *
 * @param {string} packageName e.g. `'next'`
 * @returns {boolean}
 */
export function isPackageResolvable(packageName) {
    return isPackageExists(packageName, { paths: [findWorkspaceRoot()] });
}

/**
 * An env-supplied root candidate is only plausible when it is an absolute existing directory that
 * contains (or is) `cwd` - guards against stale env leaking in from an unrelated checkout.
 *
 * @param {string | undefined} root
 * @param {string} cwd
 * @returns {boolean}
 */
function isRootOf(root, cwd) {
    if (!root || !isAbsolute(root) || !existsSync(root)) return false;
    const rel = relative(root, cwd);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

const workspaceRoots = new Map();

/**
 * Workspace root of the consumer project - the anchor for every config-file scan (Tailwind entry,
 * `next.config.*`) and root-file detection (`nx.json`): `process.cwd()` alone is unreliable
 * because lint often runs from INSIDE a package (lint-staged, IDE, `yarn workspace x lint`) while
 * the shared config must see the whole repo.
 *
 * Resolution order, cheapest first - an env candidate must contain `cwd` or it is rejected:
 * 1. env the package manager sets for its child processes: `PROJECT_CWD` (Yarn Berry),
 *    `npm_config_local_prefix` (npm >= 7, workspace-aware) - free, no fs walk at all
 * 2. `@manypkg/find-root`: walks up to the nearest workspace manifest (package.json `workspaces`,
 *    pnpm-workspace.yaml, lerna.json, rush.json, bun), falling back to the nearest `package.json`
 *    for single-package repos - covers every manager, incl. the env-less ones (pnpm, Yarn 1)
 *
 * Cached per `cwd` - the config is rebuilt on every lint run.
 *
 * @param {string} [cwd]
 * @returns {string} absolute path; `cwd` itself when there is no package.json anywhere above
 */
export function findWorkspaceRoot(cwd = process.cwd()) {
    if (workspaceRoots.has(cwd)) return workspaceRoots.get(cwd);

    let root = [process.env.PROJECT_CWD, process.env.npm_config_local_prefix].find((dir) => isRootOf(dir, cwd));
    if (root) {
        root = resolve(root);
    } else {
        try {
            root = findRootSync(cwd).rootDir;
        } catch {
            root = cwd; // no package.json anywhere above - degenerate sandbox, scans just see less
        }
    }

    workspaceRoots.set(cwd, root);
    return root;
}

const workspacePackageDirs = new Map();

/**
 * Absolute directories of all workspace packages - the real `workspaces` / `pnpm-workspace.yaml`
 * globs expanded by `@manypkg/get-packages`, NOT a scan heuristic. Single-package repos yield the
 * root itself; no package.json at all yields an empty list (degenerate sandboxes, tests).
 *
 * @returns {string[]}
 */
function findWorkspacePackages() {
    const root = findWorkspaceRoot();
    if (workspacePackageDirs.has(root)) return workspacePackageDirs.get(root);

    let dirs = [];
    try {
        dirs = getPackagesSync(root).packages.map((pkg) => pkg.dir);
    } catch {
        // no package.json at the root - only the root scan applies
    }

    workspacePackageDirs.set(root, dirs);
    return dirs;
}

/**
 * The workspace package owning `file` (e.g. the Tailwind entry CSS) - matched against the real
 * workspace package dirs (see {@link findWorkspacePackages}), NOT by walking to the nearest
 * package.json: a directory that is not a declared workspace member belongs to the root. Returns
 * the workspace root when no package contains `file`.
 *
 * @param {string} file absolute path
 * @returns {string} absolute directory path
 */
export function packageDirOf(file) {
    const root = findWorkspaceRoot();
    return (
        findWorkspacePackages()
            .filter((dir) => dir !== root)
            .sort((a, b) => b.length - a.length) // nested packages: the deepest match wins
            .find((dir) => {
                const rel = relative(dir, file);
                return !rel.startsWith('..') && !isAbsolute(rel);
            }) ?? root
    );
}

/*
 * Build outputs regularly contain COPIES of the scanned files (compiled css, a next.config.js in a
 * published dist) and would poison the scans even in repos that don't gitignore them. Scan-only -
 * GLOBAL_IGNORES stays the deliberate lint-wide list. `.git` matters for `dot: true` scans;
 * `node_modules` because the scans are depth-unbounded within a package.
 */
const SCAN_IGNORES = [
    '**/node_modules',
    '**/dist',
    '**/build',
    '**/out',
    '**/coverage',
    '**/.next',
    '**/.expo',
    '**/storybook-static',
    '**/.git',
];

/**
 * Glob for config-file candidates across the workspace: the root directory plus every workspace
 * package (the real `workspaces` globs via {@link findWorkspacePackages}, not a depth heuristic),
 * skipping dot dirs, build outputs, the given ignore patterns and everything in the root
 * `.gitignore`. Anchored to {@link findWorkspaceRoot}, NOT cwd.
 *
 * Public - useful for building consumer file lists (e.g. `typeAware.allowDefaultProject`, see README "Type-aware rules").
 *
 * @param {string} fileGlob e.g. `'*.css'`, `'next.config.*'`
 * @param {string[]} [ignores] extra glob patterns to skip
 * @param {{ dot?: boolean }} [options] `dot` also scans dot directories (e.g. `.storybook`)
 * @returns {string[]} absolute paths
 */
export function scanWorkspace(fileGlob, ignores = [], { dot = false } = {}) {
    const root = findWorkspaceRoot();
    const packages = findWorkspacePackages().filter((dir) => dir !== root);

    let gitignored = [];
    try {
        // Reuse ESLint's gitignore->minimatch conversion; glob's `ignore` speaks the same language.
        // Negations dropped: glob's ignore cannot un-ignore.
        gitignored = includeIgnoreFileCompat(resolve(root, '.gitignore')).ignores.filter(
            (pattern) => !pattern.startsWith('!'),
        );
    } catch {
        // no .gitignore - the scan is just less filtered
    }

    // `<dir-pattern>/**` variants prune the CONTENTS of ignored directories, not just the dir itself
    const ignore = [...ignores, ...SCAN_IGNORES, ...gitignored].flatMap((pattern) => [
        pattern,
        pattern.endsWith('/') ? `${pattern}**` : `${pattern}/**`,
    ]);

    // package dirs are scanned individually - keep the root scan from descending into them twice
    const rootIgnore = [
        ...ignore,
        ...packages.flatMap((dir) => {
            const rel = relative(root, dir).replaceAll('\\', '/');
            return [rel, `${rel}/**`];
        }),
    ];

    const files = [
        ...globSync(`**/${fileGlob}`, { cwd: root, ignore: rootIgnore, absolute: true, dot }),
        ...packages.flatMap((dir) => globSync(`**/${fileGlob}`, { cwd: dir, ignore, absolute: true, dot })),
    ];

    // debug('scanWorkspace', { fileGlob, root, packages, dot, ignores, files });

    return files;
}

/*
 * Capability detection, exported for debugging. Package probes resolve from the WORKSPACE ROOT -
 * the same scope the plugins' own resolution sees at lint time (eslint-plugin-tailwindcss's
 * workers, eslint-config-next's internal `require`s, eslint-plugin-storybook's static import,
 * eslint-plugin-jest's version sniffing). A tool hoisted to the root (default npm/yarn behavior)
 * is visible; a leaf-only install is not - `toolGate` then fails with hoisting guidance instead of
 * a cryptic plugin crash. `nx.json` is checked at the workspace root, not via cwd.
 */
export const hasNext = isPackageResolvable('next');
export const hasStorybook = isPackageResolvable('storybook');
export const hasVite = isPackageResolvable('vite');
export const hasJest = isPackageResolvable('jest');
export const hasVitest = isPackageResolvable('vitest');
export const hasTurbo = isPackageResolvable('turbo');
export const hasNx = existsSync(resolve(findWorkspaceRoot(), 'nx.json'));
export const hasTailwind = isPackageResolvable('tailwindcss');

debug('capability probes', { hasNext, hasStorybook, hasVite, hasJest, hasVitest, hasTurbo, hasNx, hasTailwind });

/**
 * Normalize a defineLintConfig flag into its options object with a canonical `enabled`:
 * - `true` / `false` → `{ enabled: true | false }`
 * - an options object counts as enabled unless it explicitly says otherwise - `enabled` defaults
 *   to `true`, so providing options (even `{}`) implies turning the tool on
 * - `undefined` (flag not passed) → `{}` - `enabled` stays undefined and the caller falls back to
 *   detection: `const { enabled = hasX, ...options } = asOptions(option)`
 *
 * @param {boolean | { enabled?: boolean } | undefined} option user-supplied flag from `LintOptions`
 * @returns {{ enabled?: boolean } & object}
 */
export function asOptions(option) {
    if (typeof option === 'boolean') return { enabled: option };
    if (typeof option === 'object' && option !== null) return { enabled: true, ...option };
    return {};
}

/**
 * Shared activation gate of the tool-scoped config blocks (next, storybook, turbo, nx, jest,
 * vitest, tailwind) - the one decision every block repeats: is the tool ON, and can its plugin
 * actually run. The `configs/*.js` functions keep only their tool-specific parts (which blocks to
 * emit, how the evidence feeds settings) and differ solely in the spec they pass here.
 *
 * Decision flow:
 * - `enabled: false` → off, always.
 * - strict (defineLintConfig `detection.strict`): the same-scope probe gates (`strictHas`,
 *   defaulting to `has`); `scan` never runs, but `absolutizeOptions` evidence still counts. A tool
 *   that is ON while its package is unresolvable (`requirePackage`) or its mandatory evidence is
 *   missing (`needs`) throws instead of producing a config that crashes at lint time.
 * - non-strict: evidence-based detection - `absolutizeOptions(options)` wins over the `scan()`
 *   auto-discovery; the tool is detected when the package probe hits or evidence exists (`needs`
 *   makes evidence mandatory even when the probe hits). A tool that is ON while `packageName` is
 *   unresolvable from the workspace root throws an actionable HOISTING error (no silent skip, no
 *   symlink bridging - the plugins resolve from the root scope, so only hoisting actually fixes
 *   them; the user or their AI agent picks it up from the error).
 *
 * @param {boolean | { enabled?: boolean } | undefined} option the tool's defineLintConfig flag
 * @param {boolean} strict same-scope detection only (defineLintConfig `detection.strict`)
 * @param {object} spec
 * @param {string} spec.tool flag name, used in error messages
 * @param {boolean} spec.has module-load package probe (chain resolvability, see the `has*` exports)
 * @param {boolean} [spec.strictHas] strict-mode detection gate when it differs from `has` (nx: `nx.json` at cwd)
 * @param {string} [spec.packageName] package the tool's plugin needs resolvable at lint time - ON + unresolvable from the workspace root is a hard error with hoisting guidance
 * @param {boolean} [spec.requirePackage] fail loudly when the tool is ON but `packageName` is unresolvable; defaults to `packageName` being set - pass `false` when the plugin works without the tool installed (jest/vitest)
 * @param {(options: object) => string[]} [spec.absolutizeOptions] evidence files derived from the options (absolute anchor paths for the package probes - the anchor itself need not exist, resolution walks up from its directory; allowed under strict)
 * @param {() => string[]} [spec.scan] evidence auto-discovery below the workspace root (absolute paths; never runs under strict or when `absolutizeOptions` produced files)
 * @param {boolean} [spec.allowMultiple] whether several evidence files are usable (default true - next supports several apps); when `false` several candidates are ALWAYS a hard error, even in auto mode - the right one cannot be guessed (tailwind's single entry CSS) and a silent skip of a tool that is evidently present would be hard to detect; zero candidates keeps the usual `needs` behavior
 * @param {{ what: string, detail: string, hint: string }} [spec.needs] makes evidence MANDATORY (the plugin crashes without it - tailwind's entry CSS): detection without evidence stays inert even when `has` hits, forcing the tool on without it throws
 * @returns {{ enabled: boolean, options: object, files: string[] }} the verdict, the normalized options (without `enabled`) and the evidence files
 */
export function toolGate(option, strict, spec) {
    const { enabled, ...options } = asOptions(option);
    let absolutized = [];
    let scanned = [];
    // every return path funnels through here so the effective verdict is always traceable
    const trace = (result, reason) => {
        debug(
            `toolGate \`${spec.tool}\` %o`,
            {
                strict,
                has: spec.has,
                enabled: result.enabled,
                reason,
            },
            {
                supplied: option,
                absolutized,
                scanned,
            },
        );
        return result;
    };
    const off = { enabled: false, options, files: [] };
    if (enabled === false) return trace(off, 'disabled explicitly');

    const {
        tool,
        has,
        strictHas = has,
        packageName,
        requirePackage = Boolean(packageName),
        absolutizeOptions,
        scan,
        allowMultiple = true,
        needs,
    } = spec;
    const prefix = `[@kirill.konshin/lint] \`${tool}\``;
    /*
     * Several candidates with allowMultiple off are a hard error even in auto mode: the evidence
     * proves the tool IS in use, the right candidate is unknowable, and silently skipping a tool
     * that is evidently present would be hard to detect.
     */
    const usable = (candidates) => {
        if (!allowMultiple && candidates.length > 1) {
            const fix = needs ? `pass ${needs.hint} to pick one, or set` : `set`;
            throw new Error(
                `${prefix} found several ${needs?.what ?? 'evidence'} candidates and cannot pick one - ` +
                    `${fix} \`${tool}: false\`:\n${candidates.map((file) => `  - ${file}`).join('\n')}`,
            );
        }
        return candidates;
    };

    if (strict) {
        if (!(enabled ?? strictHas)) return trace(off, 'strict probe negative');
        if (requirePackage && !has) {
            throw new Error(
                `${prefix} is on under strict detection, but the \`${packageName}\` package is not ` +
                    `resolvable at this scope - install it here or set \`${tool}: false\`.`,
            );
        }
        absolutized = absolutizeOptions?.(options) ?? [];
        const files = usable(absolutized);
        if (needs && files.length === 0) {
            throw new Error(
                `${prefix} is on under strict detection, which cannot scan for the ${needs.what} - ` +
                    `pass ${needs.hint} or set \`${tool}: false\`.`,
            );
        }
        return trace({ enabled: true, options, files }, enabled ? 'strict, forced on' : 'strict probe positive');
    }

    absolutized = absolutizeOptions?.(options) ?? [];
    scanned = absolutized.length > 0 ? [] : (scan?.() ?? []);
    const files = usable(absolutized.length > 0 ? absolutized : scanned);

    if (needs && files.length === 0) {
        // `enabled` is only defined when the consumer explicitly turned the tool on - fail loudly
        // then; detection-driven activation (enabled === undefined) stays inert instead.
        if (enabled) {
            throw new Error(
                `${prefix} was enabled explicitly, but no ${needs.detail} was found - zero or several ` +
                    `candidates. Pass ${needs.hint} explicitly.`,
            );
        }
        return trace(off, `no ${needs.what} found`);
    }

    if (!(enabled ?? (has || files.length > 0))) return trace(off, 'not detected');

    /*
     * The tool is ON but its package is invisible at the workspace root - the scope the plugins
     * resolve from at lint time. No silent skip and no symlink bridging: fail with the fix
     * (hoisting) and let the user or their AI agent pick it up from here.
     */
    if (requirePackage && !has) {
        const leaf = files.map((file) => dirname(file)).find((dir) => isPackageExists(packageName, { paths: [dir] }));
        throw new Error(
            `${prefix} is in use, but the \`${packageName}\` package is not resolvable from the workspace root` +
                (leaf ? ` (it is installed near \`${leaf}\`)` : '') +
                ` - hoist it: keep the package manager's default hoisting (no \`installConfig.hoistingLimits\` / ` +
                `\`nohoist\`), on pnpm add \`public-hoist-pattern[]=${packageName}\` to .npmrc, or add ` +
                `\`${packageName}\` to the root devDependencies. Set \`${tool}: false\` to turn the tool off. ` +
                `Run eslint with LINT_DEBUG=1 to trace detection.`,
        );
    }

    return trace({ enabled: true, options, files }, enabled ? 'forced on' : 'detected');
}
