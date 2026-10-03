import type { Config as PrettierConfig } from 'prettier';

import { eslintExts } from './exts.js';

/**
 * Shared Prettier config, the `@kirill.konshin/lint/prettier` entry. Import it from there, not the package root: the
 * root loads every ESLint plugin, which would slow down each Prettier run.
 */
export const prettier: PrettierConfig = {
    printWidth: 120,
    tabWidth: 2,
    singleQuote: true,
    proseWrap: 'never',
    overrides: [
        {
            files: eslintExts,
            options: {
                tabWidth: 4,
            },
        },
    ],
};
