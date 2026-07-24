import { execSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
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

/**
 * Nearest directory containing a `package.json`, walking up from `file` and bounded by the
 * workspace root (inclusive) - the package that owns an evidence file (e.g. the Tailwind entry
 * CSS). Returns the workspace root when no closer manifest exists or `file` lies outside the
 * workspace altogether.
 *
 * @param {string} file absolute path
 * @returns {string} absolute directory path
 */
export function packageDirOf(file) {
    const root = findWorkspaceRoot();
    let dir = dirname(file);
    while (dir !== root && !existsSync(join(dir, 'package.json'))) {
        const parent = dirname(dir);
        if (parent === dir) return root; // hit the filesystem root - `file` is outside the workspace
        dir = parent;
    }
    return dir;
}

/*
 * Build outputs regularly contain COPIES of the scanned files (compiled css, a next.config.js in a
 * published dist) and would poison the scans even in repos that don't gitignore them. Scan-only -
 * GLOBAL_IGNORES stays the deliberate lint-wide list. `.git` matters for `dot: true` scans.
 */
const SCAN_IGNORES = [
    '**/dist',
    '**/build',
    '**/out',
    '**/coverage',
    '**/.next',
    '**/.expo',
    '**/storybook-static',
    '**/.git',
];

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
 * @param {{ dot?: boolean }} [options] `dot` also scans dot directories (e.g. `.storybook`)
 * @returns {string[]} absolute paths
 */
export function scanWorkspace(fileGlob, ignores = [], { dot = false } = {}) {
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

    const files = globSync(`**/${fileGlob}`, {
        cwd: root,
        maxDepth: SCAN_DEPTH,
        ignore,
        absolute: true,
        dot,
    });

    // debug('scanWorkspace', { fileGlob, root, dot, ignores, files });

    return files;
}

/**
 * Make sure `packageName` will be resolvable for the ESLint plugins that need it at lint time.
 *
 * In a monorepo a tool is often installed only in the LEAF package that uses it - invisible both
 * to the `has*` probes and to the plugins' own resolution: eslint-plugin-tailwindcss's workers
 * call local-pkg's `getPackageInfoSync('tailwindcss')`, whose resolver is anchored at
 * process.cwd() (verified empirically: NOT the module location, and NODE_PATH is ignored);
 * `eslint-config-next` `require`s files INSIDE the `next` package; `eslint-plugin-storybook`
 * statically imports `storybook`; `eslint-plugin-jest` sniffs the installed `jest` version.
 * Bridge: resolve the package from `fromFile`'s own package context (createRequire follows the
 * leaf's dependencies and is PnP-aware) and symlink
 * `<workspace root>/node_modules/<packageName>` to it - every resolution walk inside the repo
 * passes the root node_modules, so one link fixes all cwds. The package manager prunes the link
 * on the next install; it is simply recreated on the next lint. Nothing is touched when the
 * package is already resolvable via the normal chain.
 *
 * Yarn Berry PnP (verified in a scratch PnP workspace): the leaf resolution succeeds but points
 * INSIDE the zip cache - a virtual path a symlink cannot reach - so the bridge is skipped (the
 * target-exists guard) and the function reports `false`; under PnP the tools must be declared at
 * the workspace root instead (verified working - see README).
 *
 * @param {string} packageName e.g. `'tailwindcss'`, `'next'`, `'storybook'`
 * @param {string} fromFile absolute path of a file owned by the leaf package (entry CSS, `next.config.*`, ...)
 * @param {boolean} chainResolvable whether the package already resolves via the normal chain (the `has*` probe)
 * @returns {boolean} the package is resolvable for the plugins (possibly after bridging)
 */
export function ensurePackageResolvable(packageName, fromFile, chainResolvable) {
    let leafPackageJson = null;
    try {
        leafPackageJson = createRequire(fromFile).resolve(`${packageName}/package.json`);
    } catch {
        // not a dependency of the leaf either
    }
    if (!leafPackageJson) return chainResolvable;
    if (chainResolvable) return true;

    const leafPackageDir = dirname(leafPackageJson);
    if (!existsSync(leafPackageDir)) return false; // PnP zip cache - virtual path, nothing to symlink to

    const bridge = join(findWorkspaceRoot(), 'node_modules', ...packageName.split('/'));

    let existing;
    try {
        existing = lstatSync(bridge);
    } catch {
        // nothing at the bridge path
    }

    // heal a stale bridge left over from a previous layout (symlink whose target is gone)
    if (existing?.isSymbolicLink() && !existsSync(bridge)) {
        try {
            unlinkSync(bridge);
            existing = undefined;
        } catch {
            // fall through - the existsSync() verdict below stays authoritative
        }
    }

    if (!existing) {
        try {
            mkdirSync(dirname(bridge), { recursive: true }); // scoped packages need the @scope dir
            // 'junction' for Windows (no admin rights needed); ignored on POSIX
            symlinkSync(leafPackageDir, bridge, 'junction');
        } catch {
            // best effort - verdict below
        }
    }

    return existsSync(bridge);
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
 *   defaulting to `has`); `scan` never runs and nothing is bridged, but `absolutizeOptions` evidence
 *   still counts. A tool that is ON while its package is unresolvable (`requirePackage`) or its
 *   mandatory evidence is missing (`needs`) throws instead of producing a config that crashes at
 *   lint time.
 * - non-strict: evidence-based detection - `absolutizeOptions(options)` wins over the `scan()`
 *   auto-discovery; the tool is detected when the package probe hits or evidence exists (`needs`
 *   makes evidence mandatory even when the probe hits). Leaf-only installs are bridged from the
 *   evidence files via {@link ensurePackageResolvable}; an unresolvable package turns detection
 *   off silently but fails loudly when the tool was forced on (and `requirePackage` holds).
 *
 * @param {boolean | { enabled?: boolean } | undefined} option the tool's defineLintConfig flag
 * @param {boolean} strict same-scope detection only (defineLintConfig `detection.strict`)
 * @param {object} spec
 * @param {string} spec.tool flag name, used in error messages
 * @param {boolean} spec.has module-load package probe (chain resolvability, see the `has*` exports)
 * @param {boolean} [spec.strictHas] strict-mode detection gate when it differs from `has` (nx: `nx.json` at cwd)
 * @param {string} [spec.packageName] package the tool's plugin needs resolvable at lint time - enables the leaf bridge from the evidence files
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

    const resolvable = !packageName || has || files.some((file) => ensurePackageResolvable(packageName, file, has));
    if (!resolvable) {
        if (enabled && requirePackage) {
            throw new Error(
                `${prefix} is enabled, but the \`${packageName}\` package is resolvable neither from the ` +
                    `workspace root nor from the detected evidence locations - install \`${packageName}\` ` +
                    `in the package that owns them or at the workspace root.`,
            );
        }
        if (!enabled) return trace(off, `\`${packageName}\` unresolvable`);
    }

    return trace({ enabled: true, options, files }, enabled ? 'forced on' : 'detected');
}
