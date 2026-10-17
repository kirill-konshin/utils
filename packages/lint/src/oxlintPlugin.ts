import type { ESLint } from 'eslint';

import { testColocation } from './testColocation.js';

/**
 * Oxlint JS plugin with this package's custom rules, the `@kirill.konshin/lint/oxlint-plugin` entry. The Vite+ config
 * registers it as `local`, the name the ESLint config uses, so `local/test-colocation` reads the same in both. Oxlint
 * runs ESLint-shaped rules, so the ESLint rule module is reused as is.
 */
const plugin: ESLint.Plugin = {
    meta: { name: 'local' },
    rules: { 'test-colocation': testColocation },
};

// Oxlint loads a JS plugin from its default export
// oxlint-disable-next-line import/no-default-export
export default plugin;
