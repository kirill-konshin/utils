import type { Linter } from 'eslint';
import promisePlugin from 'eslint-plugin-promise';

import { promiseRules } from '../conventions.js';

/**
 * Promise rules: recommended + overrides.
 */
export function promiseConfig(): Linter.Config[] {
    return [
        promisePlugin.configs['flat/recommended'],
        {
            name: 'eslint-plugin-promise overrides',
            rules: promiseRules,
        },
    ];
}
