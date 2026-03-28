import { defineConfig } from 'eslint/config';
import customConfig, { includeIgnoreFile } from '@kirill.konshin/eslint-config-next-custom';

export default defineConfig([
    ...customConfig,
    {
        name: 'Custom rules',
        rules: {},
    },
    includeIgnoreFile(import.meta.url, '.gitignore'),
    includeIgnoreFile(import.meta.url, '.prettierignore'),
]);
