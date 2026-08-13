import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { includeIgnoreFile as includeIgnoreFileConfig } from '@eslint/config-helpers';
import js from '@eslint/js';
import type { Linter } from 'eslint';
import globals from 'globals';

import type { DefaultIgnoreOptions } from '../index.js';
import { asOptions, GLOBAL_IGNORES } from '../lib.js';

/**
 * Core JS recommended rules, global ignores, browser + Node globals, and overrides of core ESLint
 * rules.
 *
 * `eslint-config-next` already ignores `next-env.d.ts`, but only as a bare pattern ('next-env.d.ts'),
 * which only matches at the config's own root - not when the Next app (and its generated
 * next-env.d.ts) lives in a subdirectory, like demo/web-static/ here. It's auto-generated and
 * explicitly marked "should not be edited", so exclude it recursively instead of just working
 * around individual rules (its `///` reference directives otherwise trip multiline-comment-style,
 * which would corrupt them if autofixed into a `/* *\/` block).
 */
export function baseConfig(): Linter.Config[] {
    return [
        js.configs.recommended,
        {
            name: 'Global Ignores',
            ignores: GLOBAL_IGNORES,
        },
        {
            name: 'Globals',
            languageOptions: {
                globals: {
                    ...globals.browser,
                    ...globals.node,
                },
            },
        },
        {
            name: 'ESLint overrides',
            rules: {
                'no-restricted-imports': [
                    'error',
                    {
                        paths: [
                            {
                                name: 'next/router',
                                message: 'Please use next/navigation instead of next/router',
                            },
                        ],
                    },
                ],
                // 'multiline-comment-style': ['warn', 'starred-block'],
                'multiline-comment-style': 'off',
            },
        },
    ];
}

/**
 * Convert an ignore file (`.gitignore`, `.prettierignore`, ...) into an ESLint ignores block,
 * resolved next to the consumer's config file.
 */
export function includeIgnoreFile(importMetaUrl: string, ignoreFile: string): Linter.Config {
    // @see https://blog.linotte.dev/eslint-9-next-js-935c2b6d0371
    return includeIgnoreFileConfig(resolve(dirname(fileURLToPath(importMetaUrl)), ignoreFile));
}

/**
 * The conventional ignore setup of this toolkit: `.gitignore` + `.prettierignore` next to the
 * consumer's config file, both converted into ESLint ignores via {@link includeIgnoreFile} (both
 * files must exist - the prettier scripts in README use the same two).
 *
 * There is nothing to auto-detect here - the consumer's config file location can't be known - so
 * the flag is off by default and enabling it without `importMetaUrl` is a hard error.
 */
export function defaultIgnoreConfig(option?: boolean | DefaultIgnoreOptions): Linter.Config[] {
    const { enabled = false, importMetaUrl } = asOptions(option);
    if (!enabled) return [];

    if (!importMetaUrl) {
        throw new Error(
            '[@kirill.konshin/lint] `defaultIgnore` was enabled, but `importMetaUrl` was not provided - the ' +
                'location of the consumer config file cannot be auto-detected. ' +
                'Pass `defaultIgnore: { importMetaUrl: import.meta.url }`.',
        );
    }

    return [includeIgnoreFile(importMetaUrl, '.gitignore'), includeIgnoreFile(importMetaUrl, '.prettierignore')];
}
