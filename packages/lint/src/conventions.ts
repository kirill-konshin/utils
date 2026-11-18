/*
 * Conventions shared by the ESLint blocks and the Vite+ config: file naming and the rule settings both linters apply,
 * by their ESLint names (`vitePlus.ts` maps them to Oxlint's). Free of plugin imports, like `exts.ts`, so the
 * `./vite-plus` entry loads no ESLint plugin.
 */
import type { Linter } from 'eslint';

import { tsExts } from './exts.js';

type Rules = Linter.RulesRecord;

/** `next/router` is the Pages Router API; App Router code imports `next/navigation`. */
export const coreRules: Rules = {
    'no-restricted-imports': [
        'error',
        { paths: [{ name: 'next/router', message: 'Please use next/navigation instead of next/router' }] },
    ],
};

const typeImports = { prefer: 'type-imports', fixStyle: 'inline-type-imports' };

/** The deliberate TypeScript settings, on top of each linter's recommended set. */
export const typescriptRules: Rules = {
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-require-imports': 'off',
    '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
    '@typescript-eslint/consistent-type-imports': ['error', typeImports],
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
     * `as const` is the mechanical half of "Prefer `as const` and `readonly` for immutable constants and objects" - the
     * `readonly` half is a per-case judgment call, so that guidance stays in typescript.md.
     */
    '@typescript-eslint/prefer-as-const': 'error',
};

/**
 * Declaration files: `typeof import('pkg')` annotations are the standard mechanism there (tsc itself emits them) -
 * the annotation ban of `consistent-type-imports` is meant for source files.
 */
export const declarationFileRules: Rules = {
    '@typescript-eslint/consistent-type-imports': ['error', { ...typeImports, disallowTypeAnnotations: false }],
};

/** Next.js rules turned off: plain `<a>` and `<img>` are allowed. */
export const nextRules: Rules = {
    '@next/next/no-html-link-for-pages': 'off',
    '@next/next/no-img-element': 'off',
};

/** React-side rules of `eslint-config-next` turned off, for plain React projects too. */
export const reactRules: Rules = {
    'import/no-anonymous-default-export': 'off',
    'jsx-a11y/alt-text': 'off',
};

/** Promise rules: `await` preferred, the rest of the recommended strictness relaxed. */
export const promiseRules: Rules = {
    'promise/prefer-await-to-then': 'warn',
    'promise/param-names': 'off',
    'promise/always-return': 'off',
    'promise/catch-or-return': 'off',
};

/** Test-runner rules, the same for Jest and Vitest: `test()`, not `it()`, and no skipped tests left behind. */
export const testRunnerRules = (runner: 'jest' | 'vitest'): Rules => ({
    [`${runner}/consistent-test-it`]: ['error', { fn: 'test' }],
    [`${runner}/no-disabled-tests`]: 'warn',
});

/**
 * `expectTypeOf` and `assertType` are assertions too: a type test proves its contract without a runtime expect.
 * Listed here rather than through the plugin's `typecheck` setting, which makes other rules demand type information.
 */
export const vitestRules: Rules = {
    'vitest/expect-expect': ['error', { assertFunctionNames: ['expect', 'assert', 'expectTypeOf', 'assertType'] }],
};

/**
 * Files that legitimately default-export (framework/tooling conventions): configs, stories, Storybook, Next.js App
 * Router files and declarations.
 */
export const defaultExportFiles: string[] = [
    '**/*.config.*',
    `**/*.stories.${tsExts}`,
    `**/.storybook/main.${tsExts}`,
    `**/.storybook/preview.${tsExts}`,
    '**/.lintstagedrc*',
    '**/.prettierrc*',
    '**/electron-builder.*',
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
];

/**
 * File names exempt from camelCase: Next.js App Router mandates these exact hyphenated names, React Native / Expo its
 * `App` entry, declarations follow the package they describe, and electron-builder looks up its own config name.
 */
export const filenameCaseIgnore: RegExp[] = [
    /^App\.[jt]sx?$/,
    /^not-found\.[jt]sx?$/,
    /^global-error\.[jt]sx?$/,
    /^opengraph-image\.[jt]sx?$/,
    /^twitter-image\.[jt]sx?$/,
    /^apple-icon\.[jt]sx?$/,
    /^mdx-components\.[jt]sx?$/,
    /\.d\.tsx?$/,
    /^electron-builder\..+$/,
];
