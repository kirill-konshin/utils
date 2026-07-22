import prettierFlat from 'eslint-config-prettier/flat';

/**
 * Prettier compatibility: turns off all rules that would fight the formatter.
 *
 * @see https://github.com/prettier/eslint-plugin-prettier?tab=readme-ov-file#arrow-body-style-and-prefer-arrow-callback-issue
 *   Plugin is not recommended by Prettier, they suggest to just use config, and disable all the rules, except for
 *   these two in plugin last since they disable some previously set rules:
 *     import prettierConfigRecommended from 'eslint-plugin-prettier/recommended';
 *     'arrow-body-style': 'off'
 *     'prefer-arrow-callback': 'off',
 *
 * @see https://nextjs.org/docs/app/api-reference/config/eslint#with-prettier
 *   Note the `/flat` suffix here, the difference from default entry is that `/flat` added `name` property to the
 *   exported object to improve https://eslint.org/blog/2024/04/eslint-config-inspector/ experience.
 *
 * @returns {import('eslint').Linter.Config[]}
 */
export function prettierConfig() {
    return [prettierFlat];
}
