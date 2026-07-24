import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import { findWorkspaceRoot, GLOBAL_IGNORES, hasTailwind, packageDirOf, scanWorkspace, toolGate } from '../lib.js';

/**
 * All Tailwind v4 entry CSS candidates: every `*.css` below the workspace root (see
 * `scanWorkspace` - up to five directory levels, `.gitignore`- and build-output-aware) containing
 * the Tailwind v4 marker `@import "tailwindcss"`.
 *
 * @param {string[]} ignores glob patterns to skip
 * @returns {string[]} absolute paths
 */
function findTailwindEntries(ignores) {
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
 * HARD-CRASHES with ENOENT when it can't, so {@link tailwindConfig} only enables the plugin when
 * exactly one entry is found (`allowMultiple: false` in its gate spec); with zero or several the
 * consumer must configure `cssConfigPath` manually (MANDATORY for the plugin; several candidates
 * are a hard error) - see README "Detection".
 *
 * @param {string[]} ignores glob patterns to skip
 * @returns {string | null} absolute path of the single entry, or null when zero or several were found
 */
export function findTailwindEntry(ignores) {
    const entries = findTailwindEntries(ignores);
    return entries.length === 1 ? entries[0] : null;
}

/** @typedef {import('../index.js').TailwindOptions} TailwindOptions Defined in index.d.ts. */

/**
 * Tailwind recommended rules (warnings + `no-contradicting-classname` as error) as a standalone
 * block (simple to override wholesale).
 *
 * Auto-detection is driven by the entry CSS (see {@link findTailwindEntries}), not by the package
 * probe: explicit `cssConfigPath` wins, otherwise auto-find. Zero entries stays inert in auto mode
 * (nothing marks the repo as Tailwind) but fails loudly when Tailwind was FORCED on (`true` /
 * options object) - and so does an entry whose `tailwindcss` package cannot be resolved at all.
 * SEVERAL entries fail loudly even in auto mode: they prove the repo uses Tailwind, the right one
 * cannot be guessed, and a silent skip would be hard to detect - pass `cssConfigPath` to pick one. Leaf-only installs (tailwindcss next to the entry but invisible from the
 * workspace root, where the plugin's theme-loading workers resolve it) are bridged via
 * `ensurePackageResolvable` in lib.js - see its doc for the full mechanism and PnP behavior.
 *
 * @param {boolean | TailwindOptions} [option] the defineLintConfig `tailwind` flag; auto-detected when omitted
 * @param {boolean} [strict] same-scope detection only - no entry scan, no bridge (defineLintConfig `detection.strict`)
 * @returns {Promise<import('eslint').Linter.Config[]>}
 */
export async function tailwindConfig(option, strict = false) {
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
                'single Tailwind v4 entry CSS (a *.css containing `@import "tailwindcss"`, scanned up to ' +
                '5 directory levels below the workspace root)',
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
    if (!enabled) return [];

    // an explicit path is passed through in the consumer's own notation (the absolutized copy only
    // served the probes); an auto-found entry is the absolute evidence file
    const cssConfigPath = options.cssConfigPath ?? files[0];

    /*
     * The entry CSS pins down the ONE package that uses Tailwind, so by default the block is
     * scoped to it via `basePath` (ESLint >= 9.30, absolute paths supported) instead of flagging
     * class-like strings across the whole workspace. `files[0]` is the absolutized evidence path
     * even when `cssConfigPath` was supplied relative. Owning package == workspace root (single-
     * package repo, or no manifest found) makes scoping a no-op - the block stays untouched.
     */
    const { scoped = true } = options;
    const packageDir = scoped ? packageDirOf(files[0]) : null;
    const basePath = packageDir && packageDir !== findWorkspaceRoot() ? { basePath: packageDir } : {};

    const tailwindPlugin = (await import('eslint-plugin-tailwindcss')).default;
    return [
        {
            ...tailwindPlugin.configs.recommended,
            ...basePath,
            settings: { tailwindcss: { cssConfigPath } },
        },
    ];
}
