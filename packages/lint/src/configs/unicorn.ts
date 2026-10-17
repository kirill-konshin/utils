import type { Linter } from 'eslint';
import unicornPlugin from 'eslint-plugin-unicorn';

import { filenameCaseIgnore } from '../conventions.js';
import { tsExts } from '../exts.js';

/**
 * Filename casing + node: protocol.
 *
 * Deliberately NOT using unicorn.configs['flat/recommended'] - it's 337 rules (it even folds in
 * a few unprefixed core-ESLint rules), extremely opinionated, and far beyond what was asked for.
 * Only the two rules below are actually wanted.
 */
export function unicornConfig(): Linter.Config[] {
    return [
        {
            name: 'Unicorn rules',
            files: [`**/*.${tsExts}`],
            plugins: { unicorn: unicornPlugin },
            rules: {
                'unicorn/filename-case': [
                    'error',
                    {
                        case: 'camelCase',
                        /*
                         * code-style.md only mandates FILE names; this repo's own kebab-case package
                         * directories (e.g. electron-builder, react-native) are an established convention.
                         */
                        checkDirectories: false,
                        ignore: filenameCaseIgnore,
                    },
                ],
                'unicorn/prefer-node-protocol': 'error',
            },
        },
    ];
}
