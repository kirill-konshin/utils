import { defineConfig } from 'eslint/config';
import customConfig, { includeIgnoreFile } from '@kirill.konshin/eslint-config-next-custom';

export default defineConfig([
    ...customConfig,
    {
        name: 'Custom rules',
        rules: {},
    },
    // @see https://blog.linotte.dev/eslint-9-next-js-935c2b6d0371
    includeIgnoreFile(import.meta.url, '.prettierignore'),
]);
