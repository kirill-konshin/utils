import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { globSync } from 'glob';

import type { NextOptions, TailwindOptions, ToggleOptions } from './config.js';
import {
    findNextRoots,
    findWorkspaceRoot,
    GLOBAL_IGNORES,
    hasJest,
    hasNext,
    hasNx,
    hasStorybook,
    hasTailwind,
    hasTurbo,
    hasVitest,
    packageDirOf,
    scanWorkspace,
    toolGate,
} from './lib.js';

/*
 * The activation decision of every detected tool, written once: the ESLint blocks (`configs/*.ts`) and the Vite+ config
 * (`vitePlus.ts`) both call these. Loads no ESLint plugin.
 */

/**
 * Next.js. `requirePackage`: `eslint-config-next` `require`s files inside the `next` package, so the ESLint config needs
 * `next` resolvable from the workspace root; Oxlint's native `nextjs` plugin does not.
 */
export function nextGate(option: boolean | NextOptions | undefined, strict: boolean, { requirePackage = true } = {}) {
    return toolGate(option, strict, {
        tool: 'next',
        has: hasNext,
        packageName: 'next',
        requirePackage,
        /*
         * rootDir entries may be relative or absolute paths OR globs (`apps/*` - the plugin
         * expands them itself for its settings), so for the evidence probes each entry is
         * expanded against the workspace root into real app dirs; a plain path that exists simply
         * matches itself. An entry matching nothing falls back to the literal path as the probe
         * anchor (harmless - resolution just walks up from there). The probes resolve from each
         * app's package.json.
         */
        absolutizeOptions: ({ rootDir }) =>
            (Array.isArray(rootDir) ? rootDir : [rootDir])
                .filter((dir): dir is string => Boolean(dir))
                .flatMap((dir) => {
                    const pattern = isAbsolute(dir) ? dir : resolve(findWorkspaceRoot(), dir);
                    // trailing slash = directories only; backslash normalization mirrors the plugin
                    const dirs = globSync(`${pattern.replace(/\\/g, '/').replace(/\/+$/, '')}/`, { absolute: true });
                    return (dirs.length > 0 ? dirs : [pattern]).map((appDir) => join(appDir, 'package.json'));
                }),
        scan: () => findNextRoots(GLOBAL_IGNORES).map((dir) => join(dir, 'package.json')),
    });
}

/**
 * Storybook: a `.storybook/main.*` marks a Storybook repo even when the package sits in a leaf package;
 * `eslint-plugin-storybook` statically imports `storybook`, so it must be resolvable from the workspace root.
 */
export function storybookGate(option: boolean | ToggleOptions | undefined, strict: boolean) {
    return toolGate(option, strict, {
        tool: 'storybook',
        has: hasStorybook,
        packageName: 'storybook',
        scan: () => scanWorkspace('.storybook/main.*', GLOBAL_IGNORES, { dot: true }),
    });
}

/** Turborepo: probe only, never strict - no evidence scan. */
export function turboGate(option: boolean | ToggleOptions | undefined) {
    return toolGate(option, false, { tool: 'turbo', has: hasTurbo });
}

/**
 * Nx: `nx.json` at the workspace root (strict: at cwd). `packageName`: the package the integration needs resolvable -
 * the Vite+ config runs `@nx/eslint-plugin` as a JS plugin, which needs `eslint`.
 */
export function nxGate(option: boolean | ToggleOptions | undefined, strict: boolean, { packageName = '' } = {}) {
    return toolGate(option, strict, {
        tool: 'nx',
        has: hasNx,
        // hasNx is the one non-strict `has*` (a workspace-root file check) - strict stays at cwd
        strictHas: strict && existsSync(resolve(process.cwd(), 'nx.json')),
        ...(packageName ? { packageName } : {}),
    });
}

/*
 * Test runners: a runner config file marks the repo even when the runner sits in a leaf package. The rules are pure AST
 * checks that work without the runner, so forcing one on never throws (`requirePackage: false`).
 */

export function jestGate(option: boolean | ToggleOptions | undefined, strict: boolean) {
    return toolGate(option, strict, {
        tool: 'jest',
        has: hasJest,
        packageName: 'jest',
        requirePackage: false,
        scan: () => scanWorkspace('jest.config.*', GLOBAL_IGNORES),
    });
}

export function vitestGate(option: boolean | ToggleOptions | undefined, strict: boolean) {
    return toolGate(option, strict, {
        tool: 'vitest',
        has: hasVitest,
        packageName: 'vitest',
        requirePackage: false,
        // vitest is often configured inside vite.config.* - both count as evidence
        scan: () => scanWorkspace('{vitest,vite}.config.*', GLOBAL_IGNORES),
    });
}

/**
 * All Tailwind v4 entry CSS candidates: every `*.css` across the workspace (see `scanWorkspace` -
 * the root plus every workspace package, `.gitignore`- and build-output-aware) containing the
 * Tailwind v4 marker `@import "tailwindcss"`.
 *
 */
function findTailwindEntries(ignores: string[]): string[] {
    return scanWorkspace('*.css', ignores).filter((file) => {
        try {
            return /@import\s+['"]tailwindcss['"]/.test(readFileSync(file, 'utf-8'));
        } catch {
            return false;
        }
    });
}

/**
 * Auto-find THE Tailwind v4 entry CSS ({@link findTailwindEntries} narrowed to exactly one).
 *
 * eslint-plugin-tailwindcss v4 loads the entry (`settings.tailwindcss.cssConfigPath`) and
 * HARD-CRASHES with ENOENT when it can't, so the plugin is only enabled when exactly one entry is
 * found (`allowMultiple: false` in the {@link tailwindGate} spec); with zero or several the
 * consumer must configure `cssConfigPath` manually (MANDATORY for the plugin; several candidates
 * are a hard error) - see README "Detection".
 *
 */
export function findTailwindEntry(ignores: string[]): string | null {
    const entries = findTailwindEntries(ignores);
    return entries.length === 1 ? entries[0] : null;
}

/**
 * Tailwind: `null` when off, otherwise the entry CSS (in the consumer's own notation when given) and the absolute
 * directory of the one package to scope the rules to (`null` = the whole workspace).
 */
export function tailwindGate(
    option?: boolean | TailwindOptions,
    strict = false,
): { cssConfigPath: string; absoluteCssConfigPath: string; packageDir: string | null } | null {
    /*
     * Detection is evidence-based: the entry CSS marker, NOT the package probe (`needs` makes the
     * evidence mandatory in the gate) - in a monorepo `tailwindcss` is often installed only in a
     * leaf package and unresolvable from here, while an entry CSS with `@import "tailwindcss"` is
     * unambiguous proof of a Tailwind project (`hasTailwind` stays exported for debugging).
     */
    const { enabled, options, files } = toolGate(option, strict, {
        tool: 'tailwind',
        has: hasTailwind,
        packageName: 'tailwindcss',
        needs: {
            what: 'entry CSS',
            detail:
                'single Tailwind v4 entry CSS (a *.css containing `@import "tailwindcss"`, scanned across ' +
                'the workspace root and every workspace package)',
            hint: '`tailwind: { cssConfigPath }`',
        },
        // the plugin takes exactly ONE entry - several scan candidates are a hard error
        allowMultiple: false,
        // option paths may be relative; the resolution probe needs an absolute file context
        absolutizeOptions: ({ cssConfigPath }) =>
            cssConfigPath
                ? [isAbsolute(cssConfigPath) ? cssConfigPath : resolve(findWorkspaceRoot(), cssConfigPath)]
                : [],
        scan: () => findTailwindEntries(GLOBAL_IGNORES),
    });
    if (!enabled) return null;

    // an explicit path is passed through in the consumer's own notation (the absolutized copy only
    // served the probes); an auto-found entry is the absolute evidence file
    const cssConfigPath = options.cssConfigPath ?? files[0];

    /*
     * The entry CSS pins down the ONE package that uses Tailwind, so by default the rules are
     * scoped to it (ESLint `basePath`, Vite+ override `files`) instead of flagging class-like
     * strings across the whole workspace. `files[0]` is the absolutized evidence path even when
     * `cssConfigPath` was supplied relative. Owning package == workspace root (single-package
     * repo, or the entry is not inside a declared workspace package) makes scoping a no-op.
     */
    const { scoped = true } = options;
    const owner = scoped ? packageDirOf(files[0]) : null;
    const packageDir = owner && owner !== findWorkspaceRoot() ? owner : null;

    return { cssConfigPath, absoluteCssConfigPath: files[0], packageDir };
}
