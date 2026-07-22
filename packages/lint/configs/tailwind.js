import { readFileSync } from 'node:fs';

import { asOptions, GLOBAL_IGNORES, hasTailwind, scanWorkspace } from '../lib.js';

/**
 * Auto-find the Tailwind v4 entry CSS: the single `*.css` below the workspace root (see
 * `scanWorkspace` - up to five directory levels, `.gitignore`- and build-output-aware) containing
 * the Tailwind v4 marker `@import "tailwindcss"`.
 *
 * eslint-plugin-tailwindcss v4 loads the entry (`settings.tailwindcss.cssConfigPath`) and
 * HARD-CRASHES with ENOENT when it can't, so {@link tailwindConfig} only enables the plugin when
 * exactly one entry is found; with zero or several the consumer configures `cssConfigPath`
 * manually (MANDATORY for the plugin) - see README "Tailwind CSS rules".
 *
 * @param {string[]} ignores glob patterns to skip
 * @returns {string | null} absolute path of the single entry, or null when zero or several were found
 */
export function findTailwindEntry(ignores) {
    const entries = scanWorkspace('*.css', ignores).filter((file) => {
        try {
            return /@import\s+['"]tailwindcss['"]/.test(readFileSync(file, 'utf-8'));
        } catch {
            return false;
        }
    });

    return entries.length === 1 ? entries[0] : null;
}

/** @typedef {import('../index.js').TailwindOptions} TailwindOptions Defined in index.d.ts. */

/**
 * Tailwind recommended rules (warnings + `no-contradicting-classname` as error) as a standalone
 * block (simple to override wholesale).
 *
 * Detection alone isn't enough here: the plugin needs a resolvable entry CSS (see
 * {@link findTailwindEntry}). Explicit `cssConfigPath` wins; otherwise auto-find. Auto-detected +
 * zero-or-several entries stays inert (consumer passes the path manually), but when Tailwind was
 * FORCED on (`true` / options object) the consumer explicitly asked for it, so an empty/ambiguous
 * scan fails loudly instead of silently skipping.
 *
 * @param {boolean | TailwindOptions} [option] the defineLintConfig `tailwind` flag; auto-detected when omitted
 * @returns {Promise<import('eslint').Linter.Config[]>}
 */
export async function tailwindConfig(option) {
    const { enabled, ...options } = asOptions(option);
    if (!(enabled ?? hasTailwind)) return [];

    const { cssConfigPath = findTailwindEntry(GLOBAL_IGNORES) } = options;

    if (!cssConfigPath) {
        // `enabled` is only defined when the consumer explicitly turned Tailwind on - fail loudly
        // then; detection-driven activation (enabled === undefined) stays inert instead.
        if (enabled) {
            throw new Error(
                '[@kirill.konshin/lint] `tailwind` was enabled explicitly, but no single Tailwind v4 entry CSS ' +
                    '(a *.css containing `@import "tailwindcss"`, scanned up to 5 directory levels below the ' +
                    'workspace root) was found - zero or several candidates. ' +
                    'Pass `tailwind: { cssConfigPath }` explicitly.',
            );
        }
        return [];
    }

    const tailwindPlugin = (await import('eslint-plugin-tailwindcss')).default;
    return [
        {
            ...tailwindPlugin.configs.recommended,
            settings: { tailwindcss: { cssConfigPath } },
        },
    ];
}
