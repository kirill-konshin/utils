// @see https://blog.linotte.dev/eslint-9-next-js-935c2b6d0371
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

import js from '@eslint/js';
import ts from 'typescript-eslint';
import {FlatCompat} from '@eslint/eslintrc';
import {fixupConfigRules} from '@eslint/compat';
import prettierConfigRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

const flatCompat = new FlatCompat({
    baseDirectory: dirname(fileURLToPath(import.meta.url)),
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

const index = [
    js.configs.recommended,
    ...ts.configs.recommended,
    ...fixupConfigRules([...flatCompat.extends('next')]),
    {
        // last since it disables some previously set rules
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
        },
    },
];

export default index;
