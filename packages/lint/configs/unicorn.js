import unicornPlugin from 'eslint-plugin-unicorn';

import { tsExts } from '../lib.js';

/**
 * Filename casing + node: protocol.
 *
 * Deliberately NOT using unicorn.configs['flat/recommended'] - it's 337 rules (it even folds in
 * a few unprefixed core-ESLint rules), extremely opinionated, and far beyond what was asked for.
 * Only the two rules below are actually wanted.
 *
 * @returns {import('eslint').Linter.Config[]}
 */
export function unicornConfig() {
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
                        // Next.js App Router mandates these exact hyphenated filenames - not a naming choice.
                        ignore: [
                            /^not-found\.[jt]sx?$/,
                            /^global-error\.[jt]sx?$/,
                            /^opengraph-image\.[jt]sx?$/,
                            /^twitter-image\.[jt]sx?$/,
                            /^apple-icon\.[jt]sx?$/,
                            /^mdx-components\.[jt]sx?$/,
                            /\.d\.tsx?$/,
                            /^electron-builder\..+$/,
                        ],
                    },
                ],
                'unicorn/prefer-node-protocol': 'error',
            },
        },
    ];
}
