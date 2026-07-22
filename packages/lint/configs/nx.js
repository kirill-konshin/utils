import jsoncParser from 'jsonc-eslint-parser';

import { asOptions, hasNx } from '../lib.js';

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
 * @returns {Promise<import('eslint').Linter.Config[]>}
 */
export async function nxConfig(option) {
    const { enabled = hasNx } = asOptions(option);
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
