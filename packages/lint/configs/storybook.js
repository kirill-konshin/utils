import { asOptions, hasStorybook } from '../lib.js';

/**
 * Storybook recommended rules. `eslint-plugin-storybook` statically imports the `storybook` package
 * itself, so it can only be loaded when Storybook is actually installed - hence the lazy import.
 *
 * @param {boolean | import('../index.js').ToggleOptions} [option] the defineLintConfig `storybook` flag; auto-detected when omitted
 * @returns {Promise<import('eslint').Linter.Config[]>}
 */
export async function storybookConfig(option) {
    const { enabled = hasStorybook } = asOptions(option);
    if (!enabled) return [];
    const storybookPlugin = (await import('eslint-plugin-storybook')).default;
    return storybookPlugin.configs['flat/recommended'];
}
