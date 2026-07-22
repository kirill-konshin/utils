import { dirname } from 'node:path';
import nextTs from 'eslint-config-next/typescript';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

import { asOptions, GLOBAL_IGNORES, hasNext, scanWorkspace, tsExts } from '../lib.js';

// lazy so consumers without Next don't pay the load cost - re-exported from index.js
export const nextPlugin = hasNext ? (await import('@next/eslint-plugin-next')).default : null;

/** @typedef {import('../index.js').NextOptions} NextOptions Defined in index.d.ts. */

/**
 * Auto-find Next.js app roots: every directory below the workspace root containing a
 * `next.config.*` (scanned like the Tailwind entry - see `scanWorkspace`).
 *
 * @param {string[]} ignores glob patterns to skip
 * @returns {string[]} absolute directories
 */
export function findNextRoots(ignores) {
    // Set: a dir can hold several matches (next.config.js + next.config.ts mid-migration);
    // sorted so the emitted settings block is deterministic across filesystems
    return [...new Set(scanWorkspace('next.config.*', ignores).map((file) => dirname(file)))].sort();
}

/**
 * Next.js blocks: the whole `eslint-config-next` flat config, plus `settings.next.rootDir`.
 *
 * `rootDir` is auto-detected via {@link findNextRoots} when omitted: zero apps found → no settings
 * block (the setting is optional and the plugin works without it - NOT an error, unlike the
 * Tailwind entry); one or several → ALL of them (`settings.next.rootDir` accepts an array -
 * pointing at just one app would break linting of the others).
 *
 * `eslint-config-next`'s own parser module does `require('next/dist/compiled/babel/eslint-parser')` -
 * a file INSIDE the `next` package itself - so merely *importing* `eslint-config-next` crashes if
 * `next` isn't installed at all (verified empirically: it throws "Cannot find module
 * 'next/dist/compiled/babel/eslint-parser'" the instant the module loads). Hence the lazy import
 * here; when the block is forced on without `next` around, that error IS the failure mode.
 *
 * @param {NextOptions} [options]
 * @returns {Promise<import('eslint').Linter.Config[]>}
 */
export async function nextBaseConfig({ rootDir = findNextRoots(GLOBAL_IGNORES) } = {}) {
    const next = (await import('eslint-config-next')).default;
    return [
        ...next,
        // eslint-config-next already registers the @next/next plugin, only the settings are needed
        ...(rootDir?.length ? [{ name: '@next/eslint-plugin-next settings', settings: { next: { rootDir } } }] : []),
    ];
}

/**
 * Non-Next React projects - this config is also used for Vite+React apps - still want React/React
 * Hooks/jsx-a11y linting, which `eslint-config-next` normally provides but only via the Next-specific
 * parser. Cover the same ground directly instead, with whatever parser is already active
 * (typescript-eslint for .ts/.tsx via typescriptConfig, the default parser otherwise).
 *
 * @returns {import('eslint').Linter.Config[]}
 */
export function reactConfig() {
    return [
        reactPlugin.configs.flat.recommended,
        reactPlugin.configs.flat['jsx-runtime'],
        reactHooksPlugin.configs.flat['recommended-latest'],
        jsxA11yPlugin.flatConfigs.recommended,
    ];
}

/**
 * Composite: {@link nextBaseConfig} when Next is enabled (auto-detected or forced via the flag),
 * the {@link reactConfig} fallback otherwise.
 *
 * @param {boolean | NextOptions} [option] the defineLintConfig `next` flag
 * @returns {Promise<import('eslint').Linter.Config[]>}
 */
export async function nextConfig(option) {
    const { enabled = hasNext, ...options } = asOptions(option);
    return enabled ? await nextBaseConfig(options) : reactConfig();
}

/**
 * TypeScript blocks - lives here because the wiring stems from `eslint-config-next/typescript`
 * (typescript-eslint recommended setup, useful with or without Next itself) + deliberate overrides
 * of its rule set.
 *
 * @returns {import('eslint').Linter.Config[]}
 */
export function typescriptOverridesConfig() {
    return [
        ...nextTs,
        {
            name: '@typescript-eslint overrides',
            files: [`**/*.${tsExts}`],
            rules: {
                '@typescript-eslint/explicit-module-boundary-types': 'off',
                '@typescript-eslint/no-empty-function': 'off',
                '@typescript-eslint/no-explicit-any': 'off',
                '@typescript-eslint/no-require-imports': 'off',
                '@typescript-eslint/no-unused-vars': 'off', // superseded by 'unused-imports/no-unused-imports', which is actually autofixable
                '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
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
            name: '@typescript-eslint declaration-file overrides',
            files: ['**/*.d.ts'],
            rules: {
                /*
                 * `typeof import('pkg')` annotations are the standard mechanism in declaration files
                 * (tsc itself emits them when generating .d.ts) - the annotation ban of
                 * consistent-type-imports is meant for source files.
                 */
                '@typescript-eslint/consistent-type-imports': [
                    'error',
                    { prefer: 'type-imports', fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
                ],
            },
        },
    ];
}

/**
 * Overrides of rules set by `eslint-config-next`. Always applied (not gated on Next): the
 * jsx-a11y/react entries matter for {@link reactConfig} consumers too, and turning off rules of an
 * unregistered plugin is harmless.
 *
 * @returns {import('eslint').Linter.Config[]}
 */
export function nextOverridesConfig() {
    return [
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
    ];
}

/**
 * FIXME ESLint 10 + Next fix
 *  https://github.com/vercel/next.js/issues/89764
 *  https://gist.github.com/OscarGauss/1f305edf5b7c103bb2ee32ba479f4261
 *
 * @returns {import('eslint').Linter.Config[]}
 */
export function reactSettingsConfig() {
    return [
        {
            settings: {
                react: { version: '19' },
            },
        },
    ];
}
