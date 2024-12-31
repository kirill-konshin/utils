// @see https://blog.linotte.dev/eslint-9-next-js-935c2b6d0371
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

import js from '@eslint/js';
import {FlatCompat} from '@eslint/eslintrc';
import {fixupConfigRules} from '@eslint/compat';
import prettierConfigRecommended from 'eslint-config-prettier';
import globals from 'globals';

const flatCompat = new FlatCompat({
    baseDirectory: dirname(fileURLToPath(import.meta.url)),
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

const index = [
    js.configs.recommended,
    ...fixupConfigRules([...flatCompat.extends('next', 'next/typescript')]), // https://nextjs.org/docs/app/api-reference/config/eslint#with-typescript
    {
        // Plugin is not recommended by Prettier, they suggest to just use config, and disable all the rules, except for these two in plugin:
        // 'arrow-body-style': 'off'
        // 'prefer-arrow-callback': 'off',
        // import prettierConfigRecommended from 'eslint-plugin-prettier/recommended';
        // Last since it disables some previously set rules
        name: 'Prettier',
        ...prettierConfigRecommended,
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
        },
    },
];

export default index;
