import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import { globSync } from 'glob';

/**
 * Auto-find the Tailwind v4 entry CSS: scan `*.css` up to three directory levels deep (covers
 * `packages/<x>/src`), skipping dot dirs, the given ignore patterns and everything in `.gitignore`,
 * looking for the Tailwind v4 marker `@import "tailwindcss"`.
 *
 * eslint-plugin-tailwindcss v4 loads the entry (`settings.tailwindcss.cssConfigPath`) and
 * HARD-CRASHES with ENOENT when it can't, so the caller must only enable the plugin when exactly
 * one entry is found; with zero or several the consumer configures `cssConfigPath` manually
 * (MANDATORY for the plugin) - see README "Tailwind CSS rules".
 *
 * @param {string[]} ignores glob patterns to skip, passed in (not imported) to avoid a circular dependency
 * @returns {string | null} absolute path of the single entry, or null when zero or several were found
 */
export function findTailwindEntry(ignores) {
    let gitignored = [];
    try {
        // Reuse ESLint's gitignore->minimatch conversion; glob's `ignore` speaks the same language.
        // Negations dropped: glob's ignore cannot un-ignore.
        gitignored = includeIgnoreFile(resolve(process.cwd(), '.gitignore')).ignores.filter(
            (pattern) => !pattern.startsWith('!'),
        );
    } catch {
        // no .gitignore - the scan is just less filtered
    }

    // `<dir-pattern>/**` variants prune the CONTENTS of ignored directories, not just the dir itself
    const ignore = [...ignores, ...gitignored].flatMap((pattern) => [
        pattern,
        pattern.endsWith('/') ? `${pattern}**` : `${pattern}/**`,
    ]);

    const entries = globSync('{*.css,*/*.css,*/*/*.css,*/*/*/*.css}', { ignore, absolute: true }).filter((file) => {
        try {
            return /@import\s+['"]tailwindcss['"]/.test(readFileSync(file, 'utf-8'));
        } catch {
            return false;
        }
    });

    return entries.length === 1 ? entries[0] : null;
}
