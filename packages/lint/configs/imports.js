import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import importXPlugin, { createNodeResolver } from 'eslint-plugin-import-x';
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort';
import unusedImportsPlugin from 'eslint-plugin-unused-imports';

import { tsExts } from '../lib.js';

/**
 * Import linting via eslint-plugin-import-x: recommended rules + overrides + the default-export
 * relaxation for files that legitimately default-export (framework/tooling conventions) - the
 * latter makes no sense without `import-x/no-default-export`, so it is not a separate block.
 *
 * eslint-config-next already registers `eslint-plugin-import` under the 'import' key, and ESLint 10
 * hard-errors ("Cannot redefine plugin") if a later config tries to reuse that same key with a
 * different plugin instance. eslint-plugin-import-x is a drop-in replacement, registered under its
 * own 'import-x' key instead (its own recommended config does this registration for us).
 *
 * @returns {import('eslint').Linter.Config[]}
 */
export function importXConfig() {
    return [
        importXPlugin.configs['flat/recommended'],
        {
            name: 'eslint-plugin-import-x overrides',
            settings: {
                /*
                 * `createTypeScriptImportResolver` correctly resolves relative imports and simple TS path
                 * aliases, but NOT cross-workspace-package imports in this monorepo (e.g. `@kirill.konshin/node`)
                 * or subpath exports (e.g. `next/constants`) - verified empirically. That's why the
                 * resolution-dependent rules below are turned off rather than left on the recommended default.
                 */
                'import-x/resolver-next': [createTypeScriptImportResolver(), createNodeResolver()],
            },
            rules: {
                /*
                 * Off because of the workspace/subpath resolution gaps above - re-enable per-project once
                 * resolution is confirmed reliable there (e.g. a single-app, non-monorepo consumer).
                 */
                'import-x/no-unresolved': 'off',
                'import-x/named': 'off',
                'import-x/namespace': 'off',
                'import-x/default': 'off',
                'import-x/export': 'off',
                /*
                 * Same resolution caveat, and also the two most expensive rules in the recommended set
                 * (they parse every imported module looking for its named exports).
                 */
                'import-x/no-named-as-default': 'off',
                'import-x/no-named-as-default-member': 'off',
                'import-x/no-default-export': 'warn', // relaxed for conventional files below
            },
        },
        {
            name: 'Default export overrides',
            // files that legitimately default-export (framework/tooling conventions)
            files: [
                '**/*.config.*',
                `**/*.stories.${tsExts}`,
                `**/.storybook/main.${tsExts}`,
                `**/.storybook/preview.${tsExts}`,
                '**/.lintstagedrc*',
                '**/.prettierrc*',
                `**/App.${tsExts}`,
                `**/index.${tsExts}`,
                `**/main.${tsExts}`,
                '**/*.d.ts',
                `**/default.${tsExts}`,
                `**/error.${tsExts}`,
                `**/forbidden.${tsExts}`,
                `**/global-error.${tsExts}`,
                `**/layout.${tsExts}`,
                `**/loading.${tsExts}`,
                `**/not-found.${tsExts}`,
                `**/page.${tsExts}`,
                `**/template.${tsExts}`,
                `**/unauthorized.${tsExts}`,
                `**/apple-icon.${tsExts}`,
                `**/icon.${tsExts}`,
                `**/manifest.${tsExts}`,
                `**/opengraph-image.${tsExts}`,
                `**/robots.${tsExts}`,
                `**/sitemap.${tsExts}`,
                `**/twitter-image.${tsExts}`,
            ],
            rules: {
                /*
                 * Stories always default-export `meta`, and story exports (`Default`, `WithArgs`, ...) are PascalCase by
                 * Storybook's own convention, which the general rules disallow. The stray naming-convention entry is
                 * deliberately out of place here - the rule itself lives in typescriptTypeAware.js, which
                 * defineLintConfig orders BEFORE this block precisely so this exemption wins (flat config is
                 * last-wins).
                 */
                'import-x/no-default-export': 'off',
                '@typescript-eslint/naming-convention': 'off',
            },
        },
    ];
}

/**
 * Deterministic import ordering.
 *
 * @returns {import('eslint').Linter.Config[]}
 */
export function importSortConfig() {
    return [
        {
            name: 'eslint-plugin-simple-import-sort',
            files: [`**/*.${tsExts}`],
            plugins: { 'simple-import-sort': simpleImportSortPlugin },
            rules: {
                /*
                 * Side-effect imports (polyfills, CSS) ARE sorted into their group; the sorter only
                 * preserves the relative order of multiple side-effect imports that land in the SAME
                 * group (so order-dependent side effects stay put). Non-import code between imports
                 * splits them into independently-sorted chunks (standard simple-import-sort behavior).
                 */
                'simple-import-sort/imports': [
                    'error',
                    {
                        groups: [
                            // 1. Polyfills - side-effect imports that must run first
                            ['^\\u0000.*(polyfill|core-js|regenerator-runtime|whatwg-fetch|@vitest/web-worker)'],
                            // 2. React
                            ['^react(-dom)?(/|$)'],
                            // 3. Third-party packages (node: builtins + npm packages)
                            ['^node:', '^@?\\w'],
                            // 4. Local imports - path aliases then relative
                            ['^@/', '^\\.'],
                            // 5. CSS/styles from libraries (side-effect, package path)
                            ['^\\u0000@?\\w'],
                            // 6. Local CSS/styles (side-effect, relative path)
                            ['^\\u0000'],
                        ],
                    },
                ],
            },
        },
    ];
}

/**
 * Autofixable removal of unused imports.
 *
 * @returns {import('eslint').Linter.Config[]}
 */
export function unusedImportsConfig() {
    return [
        {
            name: 'eslint-plugin-unused-imports',
            plugins: { 'unused-imports': unusedImportsPlugin },
            rules: {
                /*
                 * Unlike `@typescript-eslint/no-unused-vars/core` `no-unused-vars`, this rule is
                 * autofixable - `--fix` deletes the unused import specifier (or the whole import
                 * statement if nothing from it is used) instead of just reporting it.
                 */
                'unused-imports/no-unused-imports': 'error',
            },
        },
    ];
}
