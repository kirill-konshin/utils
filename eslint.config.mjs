// @see https://blog.linotte.dev/eslint-9-next-js-935c2b6d0371
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { includeIgnoreFile } from '@eslint/compat';
import customConfig from '@kirill.konshin/eslint-config-next-custom';
import tailwind from 'eslint-plugin-tailwindcss';

const __dirname = dirname(fileURLToPath(import.meta.url));

const gitignorePath = resolve(__dirname, '.prettierignore');

const config = [
  ...customConfig,
  ...tailwind.configs['flat/recommended'],
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
      '@typescript-eslint/camelcase': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      'import/named': 'off',
      'import/no-default-export': 'off',
      'import/no-unresolved': 'off',
      'import/no-webpack-loader-syntax': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/media-has-caption': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
      'no-console': 'off',
      'react/prop-types': 'off',
      'ringcentral/specified-comment-with-task-id': 'off',
      'react/display-name': 'off',
      'react/no-unescaped-entities': 'off',
      'react/require-default-props': 'off',
    },
  },
  includeIgnoreFile(gitignorePath),
];

export default config;
