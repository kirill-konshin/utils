import promisePlugin from 'eslint-plugin-promise';

/**
 * Promise rules: recommended + overrides.
 *
 * @returns {import('eslint').Linter.Config[]}
 */
export function promiseConfig() {
    return [
        promisePlugin.configs['flat/recommended'],
        {
            name: 'eslint-plugin-promise overrides',
            rules: {
                'promise/prefer-await-to-then': 'warn',
                'promise/param-names': 'off',
                'promise/always-return': 'off',
                'promise/catch-or-return': 'off',
            },
        },
    ];
}
