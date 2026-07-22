import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { includeIgnoreFile as includeIgnoreFileCompat } from '@eslint/compat';
import { globSync } from 'glob';

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

/**
 * Capability gate: is a package installed in the consumer's project?
 *
 * @param {string} specifier e.g. `'next/package.json'` - probe package.json, importing the real entry could have side effects
 * @returns {boolean}
 */
export function isPackageResolvable(specifier) {
    try {
        import.meta.resolve(specifier);
        return true;
    } catch {
        return false;
    }
}

// lockfiles & workspace manifests only ever live at the workspace root
const ROOT_MARKERS = [
    'yarn.lock',
    'package-lock.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'bun.lock',
    'bun.lockb',
];

/**
 * Run a shell command, returning trimmed stdout or null on any failure.
 *
 * @param {string} command
 * @param {string} cwd
 * @returns {string | null}
 */
function tryExec(command, cwd) {
    try {
        return (
            execSync(command, {
                cwd,
                stdio: ['ignore', 'pipe', 'ignore'],
                encoding: 'utf-8',
                timeout: 15_000,
            }).trim() || null
        );
    } catch {
        return null;
    }
}

/**
 * A workspace-root candidate is only plausible when it is an absolute existing directory that
 * contains (or is) `cwd` - guards against stale env / CLI answers leaking into unrelated
 * directories AND against non-path CLI noise: Yarn 1 has no real `yarn node` command, its
 * run-fallback executes it anyway and prints `yarn node v1.22.22\n...\nDone in 0.06s.` to stdout
 * (verified) - a banner must never be mistaken for a root.
 *
 * @param {string | undefined} root
 * @param {string} cwd
 * @returns {boolean}
 */
function isRootOf(root, cwd) {
    if (!root || root.includes('\n') || !isAbsolute(root) || !existsSync(root)) return false;
    const rel = relative(root, cwd);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Last-resort walk: nearest ancestor with a lockfile / workspace manifest, bounded by `.git`
 * (a marker above the repo boundary belongs to another project; `.git` is a directory in a normal
 * clone but a FILE in worktrees and submodules - existsSync covers both).
 *
 * @param {string} cwd
 * @returns {string}
 */
function walkToRootMarker(cwd) {
    let dir = cwd;
    for (;;) {
        if (ROOT_MARKERS.some((marker) => existsSync(resolve(dir, marker)))) return dir;
        if (existsSync(resolve(dir, '.git'))) return dir;
        const parent = dirname(dir);
        if (parent === dir) return cwd;
        dir = parent;
    }
}

const workspaceRoots = new Map();

/**
 * Workspace root of the consumer project - the anchor for every config-file scan (Tailwind entry,
 * `next.config.*`) and root-file detection (`nx.json`): `process.cwd()` alone is unreliable
 * because lint often runs from INSIDE a package (lint-staged, IDE, `yarn workspace x lint`) while
 * the shared config must see the whole repo.
 *
 * Resolution order, cheapest first - every candidate must contain `cwd` or it is rejected:
 * 1. env the package manager sets for its child processes: `PROJECT_CWD` (Yarn Berry),
 *    `npm_config_local_prefix` (npm >= 7, workspace-aware)
 * 2. the package managers' own CLIs (subprocess, slow - hit when e.g. the IDE spawns eslint
 *    directly): `pnpm root -w` (dirname of the printed node_modules), Yarn Berry via `yarn node`,
 *    and `npm prefix` LAST - it walks up honoring package.json `workspaces` membership, but with
 *    no package.json around it echoes cwd back, so anything more specific must win first
 * 3. walking up from `cwd` to the nearest lockfile / workspace manifest, bounded by `.git`
 *
 * TODO verify the whole package end-to-end per manager - Yarn Berry, Yarn Berry PnP, Yarn 1,
 * pnpm, npm - see README "Issues"; so far only root detection was exercised outside this repo.
 *
 * Per-manager reality (all verified empirically):
 * - Yarn Berry: env when spawned by yarn, `yarn node` probe otherwise - both give the root
 * - npm: env when spawned by npm/npx, `npm prefix` otherwise
 * - pnpm: sets NO usable env at all (not even in scripts) - always the `pnpm root -w` probe
 * - Yarn 1 (classic): sets NO root env (only `INIT_CWD` = invocation dir) and has no root
 *   command; its `yarn node` banner output is rejected by {@link isRootOf}; classic workspaces
 *   resolve via `npm prefix` (same package.json `workspaces` field) or the yarn.lock walk
 *
 * Cached per `cwd` - the CLI probes are expensive and the config is rebuilt on every lint run.
 *
 * @param {string} [cwd]
 * @returns {string} absolute path; `cwd` itself when nothing better was found
 */
export function findWorkspaceRoot(cwd = process.cwd()) {
    if (workspaceRoots.has(cwd)) return workspaceRoots.get(cwd);

    const candidates = [
        () => process.env.PROJECT_CWD,
        () => process.env.npm_config_local_prefix,
        () => {
            const nodeModules = tryExec('pnpm root -w', cwd);
            return nodeModules && dirname(nodeModules);
        },
        () => tryExec(`yarn node -p "process.env.PROJECT_CWD||''"`, cwd),
        () => tryExec('npm prefix', cwd),
    ];

    let root = null;
    for (const candidate of candidates) {
        const value = candidate();
        if (isRootOf(value, cwd)) {
            root = resolve(value);
            break;
        }
    }
    root ??= walkToRootMarker(cwd);

    workspaceRoots.set(cwd, root);
    return root;
}

/*
 * Build outputs regularly contain COPIES of the scanned files (compiled css, a next.config.js in a
 * published dist) and would poison the scans even in repos that don't gitignore them. Scan-only -
 * GLOBAL_IGNORES stays the deliberate lint-wide list.
 */
const SCAN_IGNORES = ['**/dist', '**/build', '**/out', '**/coverage', '**/.next', '**/.expo', '**/storybook-static'];

// glob's maxDepth counts path segments INCLUDING the filename (verified empirically): 6 → files up
// to five directory levels below the root, covering packages/<x>/src/styles and apps/<group>/<app>
const SCAN_DEPTH = 6;

/**
 * Glob for config-file candidates below the workspace root (up to five directory levels deep),
 * skipping dot dirs, build outputs, the given ignore patterns and everything in the root
 * `.gitignore`. Anchored to {@link findWorkspaceRoot}, NOT cwd.
 *
 * Public - useful for building consumer file lists (e.g. `typeAware.allowDefaultProject`, see README "Type-aware rules").
 *
 * @param {string} fileGlob e.g. `'*.css'`, `'next.config.*'`
 * @param {string[]} [ignores] extra glob patterns to skip
 * @returns {string[]} absolute paths
 */
export function scanWorkspace(fileGlob, ignores = []) {
    const root = findWorkspaceRoot();

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

    return globSync(`**/${fileGlob}`, {
        cwd: root,
        maxDepth: SCAN_DEPTH,
        ignore,
        absolute: true,
    });
}

/*
 * Capability detection, exported for debugging. Package probes resolve from THIS package's install
 * location, so in a monorepo where a tool lives only in leaf packages (not in the root
 * package.json) detection can miss it - that's what the per-tool force-on flags of
 * defineLintConfig are for. `nx.json` is checked at the workspace root, not via cwd.
 */
export const hasNext = isPackageResolvable('next/package.json');
export const hasStorybook = isPackageResolvable('storybook/package.json');
export const hasVite = isPackageResolvable('vite/package.json');
export const hasJest = isPackageResolvable('jest/package.json');
export const hasVitest = isPackageResolvable('vitest/package.json');
export const hasTurbo = isPackageResolvable('turbo/package.json');
export const hasNx = existsSync(resolve(findWorkspaceRoot(), 'nx.json'));
export const hasTailwind = isPackageResolvable('tailwindcss/package.json');

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
