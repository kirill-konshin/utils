import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { includeIgnoreFile as includeIgnoreFileCompat } from '@eslint/compat';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import next from 'eslint-config-next';
import nextTs from 'eslint-config-next/typescript';
import nextPlugin from '@next/eslint-plugin-next';

const index = [
    js.configs.recommended,

    ...next,
    ...nextTs,

    // @seehttps://github.com/prettier/eslint-plugin-prettier?tab=readme-ov-file#arrow-body-style-and-prefer-arrow-callback-issue
    //   Plugin is not recommended by Prettier, they suggest to just use config, and disable all the rules, except for these two in plugin last since they disable some previously set rules:
    //   import prettierConfigRecommended from 'eslint-plugin-prettier/recommended';
    //   'arrow-body-style': 'off'
    //   'prefer-arrow-callback': 'off',
    //
    // @see https://nextjs.org/docs/app/api-reference/config/eslint#with-prettier
    //   Note the `/flat` suffix here, the difference from default entry is that `/flat` added `name` property to the exported object to improve https://eslint.org/blog/2024/04/eslint-config-inspector/ experience.
    prettier,

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
        name: 'Custom rules',
        rules: {
            '@next/next/no-html-link-for-pages': 'off',
            '@next/next/no-img-element': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-empty-function': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            'import/named': 'off',
            'import/no-default-export': 'off',
            'import/no-anonymous-default-export': 'off',
            'import/no-unresolved': 'off',
            'import/no-webpack-loader-syntax': 'off',
            'jsx-a11y/alt-text': 'off',
        },
    },

    //FIXME ESLint 10 + Next fix
    // https://github.com/vercel/next.js/issues/89764
    // https://gist.github.com/OscarGauss/1f305edf5b7c103bb2ee32ba479f4261
    {
        settings: {
            react: { version: '19' },
        },
    },
];

export default index;

export { nextPlugin };

/**
 * @param {string} importMetaUrl
 * @param {string} ignoreFile
 * @returns {import('@eslint/core').ConfigObject}
 */
export function includeIgnoreFile(importMetaUrl, ignoreFile) {
    // @see https://blog.linotte.dev/eslint-9-next-js-935c2b6d0371
    return includeIgnoreFileCompat(resolve(dirname(fileURLToPath(importMetaUrl)), ignoreFile));
}
