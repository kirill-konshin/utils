// @see https://blog.linotte.dev/eslint-9-next-js-935c2b6d0371
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { includeIgnoreFile } from '@eslint/compat';
import customConfig from '@kirill.konshin/eslint-config-next-custom';

const __dirname = dirname(fileURLToPath(import.meta.url));

const gitignorePath = resolve(__dirname, '.prettierignore');

const config = [
  ...customConfig,
  {
    name: 'Custom rules',
    rules: {},
  },
  includeIgnoreFile(gitignorePath),
];

export default config;
