import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { includeIgnoreFile } from '@eslint/config-helpers';
import { findRootSync } from '@manypkg/find-root';
import { getPackagesSync } from '@manypkg/get-packages';
import { globSync } from 'glob';
import { isPackageExists } from 'local-pkg';
import { PathScurry } from 'path-scurry';

import type { LintConfig, ToggleOptions } from './config.js';

type NormalizedOptions<T extends ToggleOptions> = Omit<T, 'enabled'>;

type ToolGateSpec<T extends ToggleOptions> = {
    tool: string;
    /** Is the tool in use (the workspace-root probe)? Usually `packageName` resolvable, `nx.json` for Nx. */
    has: boolean;
    /** The strict probe from cwd, when it is not `packageName` resolvable from cwd. */
    strictHas?: boolean;
    /** The package the integration needs at lint time - checked on its own, whatever `has` probes. */
    packageName?: string;
    requirePackage?: boolean;
    absolutizeOptions?: (options: NormalizedOptions<T>) => string[];
    scan?: () => string[];
    allowMultiple?: boolean;
    needs?: { what: string; detail: string; hint: string };
};

type ToolGateResult<T extends ToggleOptions> = {
    enabled: boolean;
    options: NormalizedOptions<T>;
    files: string[];
};

//TODO coverage, dist, out, build?
export const GLOBAL_IGNORES = [
    '**/next-env.d.ts',
    '**/viteEnv.d.ts',
    '**/node_modules',
    '**/.cache',
    '**/.nx',
    '**/.turbo',
    '**/.yarn',
    // graphify's code graph, built by lint-prepare
    '**/graphify-out',
    // The spec-tools bundle: built, not source, and lint-prepare links it into the consumer's `.agents` and `.claude`.
    '**/skills/spec-tools/scripts/cli.js',
];

const LINT_DEBUG = Boolean(process.env.LINT_DEBUG);

/**
 * Structured debug logging, gated by the `LINT_DEBUG` env var (any non-empty value). Traces the
 * detection machinery: capability probes, workspace scans and per-tool gate verdicts.
 */
function debug(message: string, ...args: unknown[]): void {
    if (!LINT_DEBUG) return;
    console.log(`[@kirill.konshin/lint] ${message}`, ...args);
}

/**
 * Capability gate: is a package resolvable from `scope` - by default the workspace root, the scope the ESLint plugins
 * themselves resolve from at lint time; strict detection probes from cwd (see {@link toolGate}).
 */
export function isPackageResolvable(packageName: string, scope: string = findWorkspaceRoot()): boolean {
    return isPackageExists(packageName, { paths: [scope] });
}

/** Is `path` `dir` itself or inside it? */
const isInside = (dir: string, path: string): boolean => {
    const rel = relative(dir, path);
    return !rel.startsWith('..') && !isAbsolute(rel);
};

/**
 * An env-supplied root candidate is only plausible when it is an absolute existing directory that
 * contains (or is) `cwd` - guards against stale env leaking in from an unrelated checkout.
 */
function isRootOf(root: string | undefined, cwd: string): boolean {
    return Boolean(root && isAbsolute(root) && existsSync(root) && isInside(root, cwd));
}

const workspaceRoots = new Map<string, string>();

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
 * Returns an absolute path, or `cwd` itself when there is no package.json anywhere above.
 */
export function findWorkspaceRoot(cwd = process.cwd()): string {
    const cached = workspaceRoots.get(cwd);
    if (cached) return cached;

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

type Manifest = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
type Workspace = { dirs: string[]; manifests: Manifest[] };

const workspaces = new Map<string, Workspace>();

/**
 * The workspace of `root`, read once per process: the absolute directories of its packages - the real `workspaces` /
 * `pnpm-workspace.yaml` globs expanded by `@manypkg/get-packages`, NOT a scan heuristic; a single-package repo yields
 * the root itself - and the manifests of the root and every package. No package.json at all yields nothing
 * (degenerate sandboxes, tests).
 */
function workspaceOf(root: string = findWorkspaceRoot()): Workspace {
    const cached = workspaces.get(root);
    if (cached) return cached;

    let workspace: Workspace = { dirs: [], manifests: [] };
    try {
        const { rootPackage, packages } = getPackagesSync(root);
        workspace = {
            dirs: packages.map((pkg) => pkg.dir),
            manifests: [rootPackage, ...packages].flatMap((pkg) => (pkg ? [pkg.packageJson as Manifest] : [])),
        };
    } catch {
        // no package.json at the root - only the root scan applies
    }

    workspaces.set(root, workspace);
    return workspace;
}

/** Does this manifest declare `packageName`? Peer/optional declarations mark libraries, not users - ignored. */
const declares = ({ dependencies, devDependencies }: Manifest, packageName: string): boolean =>
    Boolean(dependencies?.[packageName] ?? devDependencies?.[packageName]);

/**
 * Does the root or a workspace package of `root` declare `packageName` in `dependencies` or `devDependencies`?
 * Peer/optional declarations are ignored, as in {@link dependsOnNext}. Reads the manifests the workspace globs name
 * (`@manypkg/get-packages`), no scan; false without a `package.json`.
 */
export function workspaceDependsOn(packageName: string, root: string = findWorkspaceRoot()): boolean {
    return workspaceOf(root).manifests.some((manifest) => declares(manifest, packageName));
}

/**
 * The workspace package owning `file` (e.g. the Tailwind entry CSS) - matched against the real
 * workspace package dirs (see {@link workspaceOf}), NOT by walking to the nearest
 * package.json: a directory that is not a declared workspace member belongs to the root. Returns
 * the workspace root when no package contains `file`.
 *
 */
export function packageDirOf(file: string): string {
    const root = findWorkspaceRoot();
    return (
        workspaceOf(root)
            .dirs.filter((dir) => dir !== root)
            .sort((a, b) => b.length - a.length) // nested packages: the deepest match wins
            .find((dir) => isInside(dir, file)) ?? root
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

const scurries = new Map<string, PathScurry>();
const gitignores = new Map<string, string[]>();

/**
 * Filesystem cache of a scanned directory, shared by every {@link scanWorkspace} call: the detection scans all walk
 * the same trees, so each directory is read once instead of once per scan. Cached per process, like the workspace
 * root and packages.
 */
function scurryOf(dir: string): PathScurry {
    const cached = scurries.get(dir);
    if (cached) return cached;

    const scurry = new PathScurry(dir);
    scurries.set(dir, scurry);
    return scurry;
}

/**
 * The root `.gitignore` as glob ignore patterns, read once per root. Reuses ESLint's gitignore->minimatch conversion;
 * glob's `ignore` speaks the same language. Negations dropped: glob's ignore cannot un-ignore.
 */
function gitignoredOf(root: string): string[] {
    const cached = gitignores.get(root);
    if (cached) return cached;

    let patterns: string[] = [];
    try {
        patterns = (includeIgnoreFile(resolve(root, '.gitignore')).ignores ?? []).filter((p) => !p.startsWith('!'));
    } catch {
        // no .gitignore - the scans are just less filtered
    }

    gitignores.set(root, patterns);
    return patterns;
}

/**
 * Glob for config-file candidates across the workspace: the root directory plus every workspace
 * package (the real `workspaces` globs via {@link workspaceOf}, not a depth heuristic),
 * skipping dot dirs, build outputs, the given ignore patterns and everything in the root
 * `.gitignore`. Anchored to {@link findWorkspaceRoot}, NOT cwd.
 *
 * Public - useful for building consumer file lists (e.g. `typeAware.allowDefaultProject`, see README "Type-aware rules").
 *
 * `dot` also scans dot directories such as `.storybook`.
 */
export function scanWorkspace(
    fileGlob: string,
    ignores: string[] = [],
    { dot = false }: { dot?: boolean } = {},
): string[] {
    const root = findWorkspaceRoot();
    const packages = workspaceOf(root).dirs.filter((dir) => dir !== root);

    // `<dir-pattern>/**` variants prune the CONTENTS of ignored directories, not just the dir itself
    const ignore = [...ignores, ...SCAN_IGNORES, ...gitignoredOf(root)].flatMap((pattern) => [
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
        ...globSync(`**/${fileGlob}`, { cwd: root, scurry: scurryOf(root), ignore: rootIgnore, absolute: true, dot }),
        ...packages.flatMap((dir) =>
            globSync(`**/${fileGlob}`, { cwd: dir, scurry: scurryOf(dir), ignore, absolute: true, dot }),
        ),
    ];

    // debug('scanWorkspace', { fileGlob, root, packages, dot, ignores, files });

    return files;
}

/**
 * Does this `package.json` declare `next` as a dependency? Peer/optional declarations are
 * deliberately ignored - they mark component libraries, not apps.
 */
function dependsOnNext(file: string): boolean {
    try {
        return declares(JSON.parse(readFileSync(file, 'utf-8')) as Manifest, 'next');
    } catch {
        return false; // unreadable / malformed - not evidence
    }
}

/**
 * Auto-find Next.js app roots below the workspace root (scanned like the Tailwind entry - see
 * {@link scanWorkspace}). `next.config.*` is optional in Next.js, so any of three signals marks an app
 * root:
 * - a `next.config.*` file
 * - a `package.json` depending on `next` (see {@link dependsOnNext})
 * - a `src/app` or `src/pages` directory - the reported root is the directory CONTAINING `src`,
 *   because the plugin resolves both layouts (`pages`/`app` and `src/pages`/`src/app`) from the
 *   package root itself; the bare root-level dir names are too generic to scan for, but such apps
 *   are caught by the other two signals
 *
 * Returns absolute directories, deduplicated (one app usually shows several signals) and sorted
 * so the emitted settings block is deterministic across filesystems. Lives here, not in the React
 * block, so the Vite+ config detects Next.js without loading `eslint-config-next`.
 */
export function findNextRoots(ignores: string[]): string[] {
    return [
        ...new Set([
            ...scanWorkspace('next.config.*', ignores).map((file) => dirname(file)),
            ...scanWorkspace('package.json', ignores)
                .filter(dependsOnNext)
                .map((file) => dirname(file)),
            // the trailing slash makes glob match directories only
            ...scanWorkspace('src/{app,pages}/', ignores).map((dir) => dirname(dirname(dir))),
        ]),
    ].sort();
}

const probes = new Map<string, boolean>();

/** `check` of the workspace root, run once per root and only when a gate asks for it - not when a module loads. */
function probe(name: string, check: (root: string) => boolean): boolean {
    const root = findWorkspaceRoot();
    const key = `${root}\0${name}`;
    const cached = probes.get(key);
    if (cached !== undefined) return cached;

    const found = check(root);
    probes.set(key, found);
    debug('capability probe', { name, root, found });
    return found;
}

/*
 * Capability detection, exported for debugging. Package probes resolve from the WORKSPACE ROOT -
 * the same scope the plugins' own resolution sees at lint time (eslint-plugin-tailwindcss's
 * workers, eslint-config-next's internal `require`s, eslint-plugin-storybook's static import,
 * eslint-plugin-jest's version sniffing). A tool hoisted to the root (default npm/yarn behavior)
 * is visible; a leaf-only install is not - `toolGate` then fails with hoisting guidance. `nx.json`
 * is checked at the workspace root, not via cwd. Lazy and cached: importing a module of this package runs none.
 */
export const hasNext = (): boolean => probe('next', (root) => isPackageResolvable('next', root));
export const hasStorybook = (): boolean => probe('storybook', (root) => isPackageResolvable('storybook', root));
export const hasVite = (): boolean => probe('vite', (root) => isPackageResolvable('vite', root));
export const hasJest = (): boolean => probe('jest', (root) => isPackageResolvable('jest', root));
export const hasVitest = (): boolean => probe('vitest', (root) => isPackageResolvable('vitest', root));
export const hasTurbo = (): boolean => probe('turbo', (root) => isPackageResolvable('turbo', root));
export const hasNx = (): boolean => probe('nx.json', (root) => existsSync(resolve(root, 'nx.json')));
export const hasTailwind = (): boolean => probe('tailwindcss', (root) => isPackageResolvable('tailwindcss', root));

/**
 * Normalize a defineLintConfig flag into its options object with a canonical `enabled`:
 * - `true` / `false` → `{ enabled: true | false }`
 * - an options object counts as enabled unless it explicitly says otherwise - `enabled` defaults
 *   to `true`, so providing options (even `{}`) implies turning the tool on
 * - `undefined` (flag not passed) → `{}` - `enabled` stays undefined and the caller falls back to
 *   detection: `const { enabled = hasX, ...options } = asOptions(option)`
 *
 */
export function asOptions<T extends ToggleOptions>(
    option: boolean | T | null | undefined,
): NormalizedOptions<T> & { enabled?: boolean } {
    if (typeof option === 'boolean') return { enabled: option } as NormalizedOptions<T> & { enabled?: boolean };
    if (typeof option === 'object' && option !== null) {
        return { enabled: true, ...option } as NormalizedOptions<T> & { enabled?: boolean };
    }
    return {} as NormalizedOptions<T> & { enabled?: boolean };
}

/** A tool option with the `detection` setting applied: see {@link detectionOf}. */
type DetectionFlag = <T>(option: T | undefined) => T | false | undefined;

/**
 * The `detection` setting of `lint.config.ts`, read the same way by the ESLint config, the Vite+ config and
 * `lint-prepare` (same toggle notation as the tools): `detect` - tools are ON unless said otherwise (default true);
 * `strict` - same-scope probes from cwd only, no workspace evidence scans (default false; for per-package monorepo
 * configs); `flag` - with detection off, a tool not mentioned explicitly is OFF instead of auto-detected.
 */
export function detectionOf(config: LintConfig): { detect: boolean; strict: boolean; flag: DetectionFlag } {
    const { enabled: detect = true, strict = false } = asOptions(config.detection);
    const flag: DetectionFlag = (option) => (option === undefined && !detect ? false : option);
    return { detect, strict, flag };
}

/**
 * Shared activation gate of the tool-scoped config blocks (next, storybook, turbo, nx, jest,
 * vitest, tailwind) - the one decision every block repeats: is the tool ON, and can its plugin
 * actually run. The `configs/*.ts` functions keep only their tool-specific parts (which blocks to
 * emit, how the evidence feeds settings) and differ solely in the spec they pass here.
 *
 * Decision flow:
 * - `enabled: false` → off, always.
 * - strict (defineLintConfig `detection.strict`): every probe runs from cwd - `packageName` resolvable from
 *   cwd, or the tool's own `strictHas` (e.g. `nx.json` at cwd), else `has`; `scan` never runs, but
 *   `absolutizeOptions` evidence still counts. A tool that is ON while its package is unresolvable from cwd
 *   (`requirePackage`) or its mandatory evidence is missing (`needs`) throws instead of producing a config that
 *   crashes at lint time.
 * - non-strict: evidence-based detection - `absolutizeOptions(options)` wins over the `scan()`
 *   auto-discovery; the tool is detected when the package probe hits or evidence exists (`needs`
 *   makes evidence mandatory even when the probe hits). A tool that is ON while `packageName` is
 *   unresolvable from the workspace root throws an actionable HOISTING error (no silent skip - the
 *   plugins resolve from the root scope, so only hoisting fixes them).
 *
 */
export function toolGate<T extends ToggleOptions>(
    option: boolean | T | undefined,
    strict: boolean,
    spec: ToolGateSpec<T>,
): ToolGateResult<T> {
    const { enabled, ...rawOptions } = asOptions(option);
    const options = rawOptions as NormalizedOptions<T>;
    let absolutized: string[] = [];
    let scanned: string[] = [];
    // every return path funnels through here so the effective verdict is always traceable
    const trace = (result: ToolGateResult<T>, reason: string): ToolGateResult<T> => {
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
    const off: ToolGateResult<T> = { enabled: false, options, files: [] };
    if (enabled === false) return trace(off, 'disabled explicitly');

    const {
        tool,
        has,
        strictHas,
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
    const usable = (candidates: string[]): string[] => {
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
        const here = packageName ? isPackageResolvable(packageName, process.cwd()) : has;
        if (!(enabled ?? strictHas ?? here)) return trace(off, 'strict probe negative');
        if (requirePackage && !here) {
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
     * resolve from at lint time: fail with the fix (hoisting).
     */
    if (requirePackage && packageName && !isPackageResolvable(packageName)) {
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
