import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import jsoncParser from 'jsonc-eslint-parser';

import { hasNx, toolGate } from '../lib.js';

// lazy so consumers without Nx don't pay the load cost (it drags in a large part of nx itself) -
// re-exported from index.js
export const nxPlugin = hasNx ? (await import('@nx/eslint-plugin')).default : null;

/**
 * Nx blocks: plugin registration + `@nx/dependency-checks` on every `package.json`.
 *
 * Only `flat/base` (registers the '@nx' plugin, no rules of its own).
 *
 * `flat/typescript`/`flat/javascript` were deliberately NOT used - same call as with eslint-plugin-unicorn's
 * recommended: they bundle the ENTIRE @stylistic plugin (hundreds of formatting rules - indent, quotes,
 * semi, comma-dangle, ...) which would directly fight Prettier, plus a second full copy of
 * @typescript-eslint/recommended that would relitigate rules already configured deliberately here.
 *
 * @param {boolean | import('../index.js').ToggleOptions} [option] the defineLintConfig `nx` flag; auto-detected (workspace `nx.json`) when omitted
 * @param {boolean} [strict] same-scope detection only: `nx.json` at cwd instead of the workspace root (defineLintConfig `detection.strict`)
 * @returns {Promise<import('eslint').Linter.Config[]>}
 */
export async function nxConfig(option, strict = false) {
    const { enabled } = toolGate(option, strict, {
        tool: 'nx',
        has: hasNx,
        // hasNx is the one non-strict `has*` (a workspace-root file check) - strict stays at cwd
        strictHas: strict && existsSync(resolve(process.cwd(), 'nx.json')),
    });
    if (!enabled) return [];
    const nx = (await import('@nx/eslint-plugin')).default;
    return [
        ...nx.configs['flat/base'],
        {
            name: '@nx/dependency-checks',
            files: ['**/package.json'],
            languageOptions: {
                parser: jsoncParser,
            },
            rules: {
                // https://nx.dev/docs/technologies/eslint/eslint-plugin/guides/dependency-checks
                '@nx/dependency-checks': 'error',
            },
        },
    ];
}
