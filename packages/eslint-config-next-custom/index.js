/*
 * jest/vitest plugins stay statically imported even though their recommended sets are gated below:
 * the runner-agnostic 'Test rules' block registers both plugins unconditionally (its rules are pure
 * AST checks that work without the runner installed).
 *
 * Plugins used only behind capability gates (and for the re-exports at the bottom) are imported
 * lazily so consumers without the tool don't pay their load cost — @nx/eslint-plugin in particular
 * drags in a large part of nx itself. Like storybookConfig below, the re-exported bindings are null
 * when the underlying tool isn't installed.
 *
 * Gate each test-runner's recommended rule set on the runner actually being installed - per
 * packages/agents/rules/testing.md ("if project use vite use vitest, otherwise jest"), a project
 * normally has exactly one of these, and applying the other runner's correctness rules to it would
 * be conceptually wrong (even if mechanically harmless, since the rule namespaces don't collide).
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { includeIgnoreFile as includeIgnoreFileCompat } from '@eslint/compat';
import js from '@eslint/js';
import vitestPlugin from '@vitest/eslint-plugin';
import nextTs from 'eslint-config-next/typescript';
import prettierFlat from 'eslint-config-prettier/flat';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import importXPlugin, { createNodeResolver } from 'eslint-plugin-import-x';
import jestPlugin from 'eslint-plugin-jest';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import promisePlugin from 'eslint-plugin-promise';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort';
import unicornPlugin from 'eslint-plugin-unicorn';
import unusedImportsPlugin from 'eslint-plugin-unused-imports';
import globals from 'globals';
import jsoncParser from 'jsonc-eslint-parser';

import { testColocation } from './rules/testColocation.js';

export const tsExtsRaw = 'js,jsx,ts,tsx,cjs,cts,mjs,mts'; // TODO mdx, needs loader
export const eslintExtsRaw = `${tsExtsRaw},md,mdx,htm,html,vue`;
export const prettierExtsRaw = 'css,scss,sass,less,yml,yaml,json,json5,graphql,graphqls,xml';

export const tsExts = `{${tsExtsRaw}}`;
export const eslintExts = `*.{${eslintExtsRaw}}`;
export const prettierExts = `*.{${prettierExtsRaw}}`;

function isPackageResolvable(specifier) {
    try {
        import.meta.resolve(specifier);
        return true;
    } catch {
        return false;
    }
}

const hasNext = isPackageResolvable('next/package.json');
const nextPlugin = hasNext ? (await import('@next/eslint-plugin-next')).default : null;
const hasStorybook = isPackageResolvable('storybook/package.json');
const hasVite = isPackageResolvable('vite/package.json');
const hasJest = isPackageResolvable('jest/package.json');
const hasVitest = isPackageResolvable('vitest/package.json');

const ENABLE_TYPE_AWARE_RULES = false;

/*
 * `eslint-plugin-storybook` is a dependency of this package (like `@next/eslint-plugin-next` is for
 * Next), but its own code statically imports the `storybook` package itself, which most consumers won't
 * have installed - it's an optional peer here, same as `next` the framework is for `@next/eslint-plugin-next`.
 * Resolve it lazily so loading this module doesn't crash for non-Storybook consumers; `storybookConfig`
 * is exported as `null` if it couldn't be resolved, mirroring how `nextPlugin` is always importable but
 * only useful where the underlying tool is actually installed.
 */
let storybookConfig = null;
try {
    const storybook = await import('eslint-plugin-storybook');
    storybookConfig = storybook.default.configs['flat/recommended'];
} catch {
    // `storybook` isn't installed in this project - `storybookConfig` stays null.
}

/*
 * `eslint-config-next`'s own parser module does `require('next/dist/compiled/babel/eslint-parser')` -
 * a file INSIDE the `next` package itself - so merely *importing* `eslint-config-next` crashes if
 * `next` isn't installed at all, regardless of any later conditional logic (verified empirically: it
 * throws "Cannot find module 'next/dist/compiled/babel/eslint-parser'" the instant the module loads).
 * Mirror the eslint-plugin-storybook pattern above: only import it when `next` is actually there.
 */
let nextConfig = [];
if (hasNext) {
    try {
        const next = await import('eslint-config-next');
        nextConfig = next.default;
    } catch {
        // shouldn't happen given hasNext already confirmed `next/package.json` resolves, but stay safe
    }
}

/*
 * Non-Next React projects - this config is also used for Vite+React apps - still want React/React
 * Hooks/jsx-a11y linting, which `eslint-config-next` normally provides but only via the Next-specific
 * parser above. Cover the same ground directly instead, with whatever parser is already active
 * (typescript-eslint for .ts/.tsx via `nextTs` below, the default parser otherwise).
 */
const reactFallbackConfig = hasNext
    ? []
    : [
          reactPlugin.configs.flat.recommended,
          reactPlugin.configs.flat['jsx-runtime'],
          reactHooksPlugin.configs.flat['recommended-latest'],
          jsxA11yPlugin.flatConfigs.recommended,
      ];

/*
 * Gate the Turbo rule set on the tool actually being installed, same as jest/vitest above. A bare cwd
 * config-file check would make lint results depend on the invocation directory (IDE integrations and
 * per-package runs launch eslint from subdirectories). Without the turbo gate,
 * `turbo/no-undeclared-env-vars` treats "no turbo.json" as "nothing declared" and flags every single
 * env var access - useless noise for consumers that use NX (or nothing) instead. `eslint-plugin-turbo`
 * is bundled but does not drag in `turbo` itself, so this resolvability check stays honest.
 */
const hasTurbo = isPackageResolvable('turbo/package.json');

/*
 * NX cannot use the same resolvability gate: `nx` core is always resolvable here as a transitive dep of
 * the bundled @nx/eslint-plugin (-> @nx/devkit -> nx), so `isPackageResolvable('nx')` reports true in
 * every consumer - including plain non-Nx projects, where it wrongly switches on @nx/dependency-checks,
 * which then fails with no project graph. Detect an actual Nx workspace by walking up from cwd to an
 * `nx.json` instead: unlike a bare cwd check this is stable across subdirectory / per-package / IDE runs
 * (they resolve to the same workspace root) and correctly stays off outside an Nx workspace.
 */
function hasWorkspaceFile(fileName) {
    let dir = process.cwd();
    for (;;) {
        if (existsSync(resolve(dir, fileName))) return true;
        const parent = dirname(dir);
        if (parent === dir) return false;
        dir = parent;
    }
}

const hasNx = hasWorkspaceFile('nx.json');

// lazy for the same reason as nextPlugin above
const turboPlugin = hasTurbo ? (await import('eslint-plugin-turbo')).default : null;
const nxPlugin = hasNx ? (await import('@nx/eslint-plugin')).default : null;

const index = [
    js.configs.recommended,

    /*
     * `eslint-config-next` already ignores `next-env.d.ts`, but only as a bare pattern ('next-env.d.ts'),
     * which only matches at the config's own root - not when the Next app (and its generated
     * next-env.d.ts) lives in a subdirectory, like demo/web-static/ here. It's auto-generated and
     * explicitly marked "should not be edited", so exclude it recursively instead of just working
     * around individual rules (its `///` reference directives otherwise trip multiline-comment-style,
     * which would corrupt them if autofixed into a `/* *\/` block).
     */
    {
        ignores: [
            //TODO coverage, dist, out, build?
            '**/next-env.d.ts',
            '**/viteEnv.d.ts',
            '**/node_modules',
            '**/.cache',
            '**/.nx',
            '**/.turbo',
            '**/.yarn',
        ],
    },

    ...nextConfig,
    ...nextTs,
    ...reactFallbackConfig,

    /*
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
     */
    prettierFlat,

    ...(storybookConfig ?? []),

    /*
     * eslint-config-next already registers `eslint-plugin-import` under the 'import' key, and ESLint 10
     * hard-errors ("Cannot redefine plugin") if a later config tries to reuse that same key with a
     * different plugin instance. eslint-plugin-import-x is a drop-in replacement, registered under its
     * own 'import-x' key instead (its own recommended config does this registration for us).
     */
    importXPlugin.configs['flat/recommended'],

    promisePlugin.configs['flat/recommended'],

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
            // packages/agents/rules/typescript.md
            'import-x/no-default-export': 'warn', // see 'Storybook overrides' below
        },
    },

    {
        name: 'eslint-plugin-simple-import-sort',
        files: [`**/*.${tsExts}`],
        plugins: { 'simple-import-sort': simpleImportSortPlugin },
        rules: {
            /*
             * packages/agents/rules/typescript.md - Import/export order.
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

    {
        name: 'Globals',
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
    },

    {
        name: 'ESLint overrides',
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            name: 'next/router',
                            message: 'Please use next/navigation instead of next/router',
                        },
                    ],
                },
            ],
            // 'multiline-comment-style': ['warn', 'starred-block'],
            'multiline-comment-style': 'off',
        },
    },

    {
        name: 'eslint-config-next overrides',
        rules: {
            '@next/next/no-html-link-for-pages': 'off',
            '@next/next/no-img-element': 'off',
            'import/no-anonymous-default-export': 'off', // overrides eslint-config-next's own default
            'jsx-a11y/alt-text': 'off',
            'react/prop-types': 'off', // ts does it statically
        },
    },

    {
        name: '@typescript-eslint overrides',
        files: [`**/*.${tsExts}`],
        rules: {
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-empty-function': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-unused-vars': 'off', // superseded by 'unused-imports/no-unused-imports' below, which is actually autofixable
            '@typescript-eslint/consistent-type-definitions': ['error', 'type'], // packages/agents/rules/typescript.md - Type Annotation Patterns
            '@typescript-eslint/consistent-type-imports': [
                'error',
                { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
            ],
            '@typescript-eslint/ban-ts-comment': [
                'error',
                {
                    'ts-expect-error': 'allow-with-description',
                    'ts-ignore': true,
                    'ts-nocheck': true,
                    'ts-check': false,
                    minimumDescriptionLength: 3,
                },
            ],
            /*
             * `as const` is the mechanical half of "Prefer `as const` and `readonly` for immutable
             * constants and objects" - the `readonly` half is a per-case judgment call (which objects
             * deserve it), so that guidance stays in typescript.md instead of being lint-enforced here.
             */
            '@typescript-eslint/prefer-as-const': 'error',
        },
    },

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

    {
        name: 'Unicorn rules',
        /*
         * Deliberately NOT using unicorn.configs['flat/recommended'] - it's 337 rules (it even folds in
         * a few unprefixed core-ESLint rules), extremely opinionated, and far beyond what was asked for.
         * Only the two rules below are actually wanted.
         */
        files: [`**/*.${tsExts}`],
        plugins: { unicorn: unicornPlugin },
        rules: {
            // packages/agents/rules/code-style.md
            'unicorn/filename-case': [
                'error',
                {
                    case: 'camelCase',
                    /*
                     * code-style.md only mandates FILE names; this repo's own kebab-case package
                     * directories (e.g. eslint-config-next-custom) are an established convention.
                     */
                    checkDirectories: false,
                    // Next.js App Router mandates these exact hyphenated filenames - not a naming choice.
                    ignore: [
                        /^not-found\.[jt]sx?$/,
                        /^global-error\.[jt]sx?$/,
                        /^opengraph-image\.[jt]sx?$/,
                        /^twitter-image\.[jt]sx?$/,
                        /^apple-icon\.[jt]sx?$/,
                        /^next-env\.d\.ts$/,
                        /^electron-builder\..+$/,
                    ],
                },
            ],
            // packages/agents/rules/typescript.md
            'unicorn/prefer-node-protocol': 'error',
        },
    },

    {
        name: 'eslint-plugin-promise overrides',
        rules: {
            // packages/agents/rules/typescript.md - not part of promise's own recommended set
            'promise/prefer-await-to-then': 'warn',
            'promise/param-names': 'off',
            'promise/always-return': 'off',
            'promise/catch-or-return': 'off',
        },
    },

    //FIXME Does not perform, turned off
    ENABLE_TYPE_AWARE_RULES
        ? {
              name: 'Type-aware rules (separate for performance)',
              files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts', '**/*.mdx'],
              languageOptions: {
                  parserOptions: {
                      projectService: {
                          /*
                           * Config files like vite.config.ts and .storybook/{main,preview}.ts sit at the
                           * package root or in a dotfolder, outside its own tsconfig.json `include: ["src"]`
                           * - projectService has no tsconfig to attach them to otherwise. allowDefaultProject
                           * falls back to a synthetic single-file program for these instead of erroring.
                           * `**` isn't allowed here, so root-level, one-level-nested, and this monorepo's own
                           * packages/* layout are each spelled out explicitly.
                           */
                          allowDefaultProject: [
                              //FIXME NOT PROJECT AGNOSTIC
                              'vite.config.ts',
                              '*/vite.config.ts',
                              'packages/*/vite.config.ts',
                              '.storybook/main.ts',
                              '*/.storybook/main.ts',
                              'packages/*/.storybook/main.ts',
                              '.storybook/preview.ts',
                              '*/.storybook/preview.ts',
                              'packages/*/.storybook/preview.ts',
                          ],
                          // Default cap is 8; this monorepo alone has 14 vite.config.ts + 10 .storybook/*.ts files.
                          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 50,
                      },
                      tsconfigRootDir: process.cwd(),
                  },
              },
              rules: {
                  // packages/agents/rules/typescript.md - require type info, hence the separate block
                  '@typescript-eslint/prefer-optional-chain': 'warn',
                  '@typescript-eslint/prefer-nullish-coalescing': 'warn',

                  /**
                   * https://typescript-eslint.io/rules/naming-convention/
                   *
                   * packages/agents/rules/typescript.md - Naming Conventions. Lives here (not 'Custom
                   * rules') because the `types: ['boolean']` filter below needs type info too, even
                   * though naming-convention as a whole isn't in the typed-linting rule set.
                   */
                  '@typescript-eslint/naming-convention': [
                      'warn',
                      { selector: 'default', format: null },
                      /*
                       * PascalCase allowed too: per packages/agents/rules/react.md, this codebase's actual
                       * convention is `const Cmp: FC<Props> = memo(...)` - components are PascalCase
                       * variables, not just PascalCase function declarations.
                       */
                      {
                          selector: 'variable',
                          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
                          leadingUnderscore: 'forbid',
                      },
                      {
                          selector: 'variable',
                          types: ['boolean'],
                          /*
                           * The part AFTER the prefix is naturally capitalized (isLoading, hasError, ...),
                           * so it's validated as PascalCase, not camelCase - format here is for the suffix,
                           * not the identifier as a whole.
                           */
                          format: ['PascalCase'],
                          prefix: ['is', 'has', 'had', 'can', 'should', 'will', 'did'],
                      },
                      /*
                       * Established exceptions to the boolean-prefix rule above - conventional enough on
                       * their own (React's own `loading`/`done` state names, DOM/library `enabled` flags)
                       * that requiring is/has/can/should here would just be noise.
                       */
                      {
                          selector: 'variable',
                          types: ['boolean'],
                          filter: { regex: '^(done|loading|enabled)$', match: true },
                          format: ['camelCase'],
                      },
                      { selector: 'function', format: ['camelCase', 'PascalCase'] },
                      { selector: 'class', format: ['PascalCase'] },
                  ],
              },
          }
        : null,

    {
        name: 'Default export overrides',
        files: [
            '**/*.config.*',
            `**/*.stories.${tsExts}`,
            `**/.storybook/main.${tsExts}`,
            `**/.storybook/preview.${tsExts}`,
            '**/.lintstagedrc*',
            '**/.prettierrc*',
            `**/App.${tsExts}`,
            `**/index.${tsExts}`,
            `**/layout.${tsExts}`,
            `**/loading.${tsExts}`,
            `**/main.${tsExts}`,
            `**/page.${tsExts}`,
        ],
        rules: {
            /*
             * packages/agents/rules/storybook.md - stories always default-export `meta`, and story
             * exports (`Default`, `WithArgs`, ...) are PascalCase by Storybook's own convention, which
             * the general rules above disallow.
             */
            'import-x/no-default-export': 'off',
            '@typescript-eslint/naming-convention': 'off',
        },
    },

    ...(hasTurbo
        ? [
              turboPlugin.configs['flat/recommended'],
              {
                  name: 'eslint-plugin-turbo overrides',
                  rules: {
                      /*
                       * Only covers undeclared env vars, not the full dependsOn/outputs consistency
                       * described in packages/agents/rules/monorepo-turbo-nx.md - that part has no
                       * ESLint-shaped check. Downgraded from their default 'error' to 'warn'.
                       */
                      'turbo/no-undeclared-env-vars': 'warn',
                  },
              },
          ]
        : []),

    ...(hasNx
        ? [
              /*
               * Only `flat/base` (registers the '@nx' plugin, no rules of its own).
               *
               * `flat/typescript`/ `flat/javascript` were deliberately NOT used - same call as with eslint-plugin-unicorn's
               * recommended: they bundle the ENTIRE @stylistic plugin (hundreds of formatting rules - indent, quotes,
               * semi, comma-dangle, ...) which would directly fight Prettier, plus a second full copy of
               * @typescript-eslint/recommended that would relitigate rules already configured deliberately above.
               */
              ...nxPlugin.configs['flat/base'],
              {
                  name: '@nx/dependency-checks',
                  files: ['**/package.json'],
                  languageOptions: {
                      parser: jsoncParser,
                  },
                  rules: {
                      // https://nx.dev/docs/technologies/eslint/eslint-plugin/guides/dependency-checks
                      '@nx/dependency-checks': 'error',
                  },
              },
          ]
        : []),

    ...(hasJest
        ? [
              {
                  ...jestPlugin.configs['flat/recommended'],
                  name: 'Jest Rules',
                  files: [`**/*.{test,spec}.${tsExts}`],
              },
          ]
        : []),

    ...(hasVitest
        ? [
              {
                  ...vitestPlugin.configs.recommended,
                  name: 'Vitest Rules',
                  files: [`**/*.{test,spec}.${tsExts}`],
              },
              {
                  ...vitestPlugin.configs.env,
                  name: 'Vitest globals',
                  files: [`**/*.{test,spec}.${tsExts}`],
              },
          ]
        : []),

    {
        /*
         * Runner-agnostic: this rule is pure AST/call-name checking, needs neither jest nor vitest
         * installed to work correctly, so it applies regardless of which one (if either) is present.
         */
        name: 'Test rules',
        files: [`**/*.{test,spec}.${tsExts}`],
        plugins: {
            jest: jestPlugin,
            vitest: vitestPlugin,
            local: { rules: { 'test-colocation': testColocation } },
        },
        rules: {
            // packages/agents/rules/testing.md - "Use test(...) for individual test cases"
            'jest/consistent-test-it': ['error', { fn: 'test' }],
            'vitest/consistent-test-it': ['error', { fn: 'test' }],
            'local/test-colocation': 'error',
            'jest/no-disabled-tests': 'warn',
            'vitest/no-disabled-tests': 'warn',
        },
    },

    /*
     * FIXME ESLint 10 + Next fix
     *  https://github.com/vercel/next.js/issues/89764
     *  https://gist.github.com/OscarGauss/1f305edf5b7c103bb2ee32ba479f4261
     */
    {
        settings: {
            react: { version: '19' },
        },
    },
].filter(Boolean);

export default index;

export { nextPlugin, nxPlugin, turboPlugin, jestPlugin, vitestPlugin, storybookConfig };

/**
 * @param {string} importMetaUrl
 * @param {string} ignoreFile
 * @returns {import('@eslint/core').ConfigObject}
 */
export function includeIgnoreFile(importMetaUrl, ignoreFile) {
    // @see https://blog.linotte.dev/eslint-9-next-js-935c2b6d0371
    return includeIgnoreFileCompat(resolve(dirname(fileURLToPath(importMetaUrl)), ignoreFile));
}

export const prettier = {
    printWidth: 120,
    tabWidth: 2,
    singleQuote: true,
    overrides: [
        {
            files: eslintExts,
            options: {
                tabWidth: 4,
            },
        },
    ],
};

/**
 * https://nextjs.org/docs/app/api-reference/config/eslint#running-lint-on-staged-files
 *
 * Pay extra attention when the configured globs overlap, and tasks make edits to files. Prettier and eslint might try
 * to make changes to the same *.ts file at the same time, causing a race condition.
 *
 * https://github.com/lint-staged/lint-staged?tab=readme-ov-file#reformatting-the-code
 * https://github.com/lint-staged/lint-staged/issues/775
 * You don't need git add since lint-staged 10
 *
 * TODO Screw yarn, just use eslint directly? Yarn gives greater control over what is in the console...
 *
 * @returns {import('lint-staged').Configuration}
 */
export const listStaged = {
    [prettierExts]: ['yarn prettier'],
    [eslintExts]: ['yarn eslint', 'yarn prettier'],
};
