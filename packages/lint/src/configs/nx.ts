import type nxPlugin from '@nx/eslint-plugin';
import type { Linter } from 'eslint';
import * as jsoncParser from 'jsonc-eslint-parser';

import type { ToggleOptions } from '../config.js';
import { nxGate } from '../gates.js';

/** `@nx/eslint-plugin`, loaded on demand: it drags in a large part of Nx itself. */
export const loadNxPlugin = async (): Promise<typeof nxPlugin> => (await import('@nx/eslint-plugin')).default;

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
 */
export async function nxConfig(option?: boolean | ToggleOptions, strict = false): Promise<Linter.Config[]> {
    const { enabled } = nxGate(option, strict);
    if (!enabled) return [];
    const nx = await loadNxPlugin();
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
