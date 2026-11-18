import { dirname } from 'node:path';
import type nextPlugin from '@next/eslint-plugin-next';
import type { Linter } from 'eslint';
import nextTs from 'eslint-config-next/typescript';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

import type { NextOptions } from '../config.js';
import { declarationFileRules, nextRules, reactRules, typescriptRules } from '../conventions.js';
import { tsFiles } from '../exts.js';
import { nextGate } from '../gates.js';
import { findNextRoots, GLOBAL_IGNORES } from '../lib.js';

/** `@next/eslint-plugin-next`, loaded on demand: consumers without Next never pay for it. */
export const loadNextPlugin = async (): Promise<typeof nextPlugin> =>
    (await import('@next/eslint-plugin-next')).default;

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
 */
export async function nextBaseConfig({ rootDir = findNextRoots(GLOBAL_IGNORES) }: NextOptions = {}): Promise<
    Linter.Config[]
> {
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
 */
export function reactBaseConfig(): Linter.Config[] {
    return [
        reactPlugin.configs.flat.recommended,
        reactPlugin.configs.flat['jsx-runtime'],
        reactHooksPlugin.configs.flat['recommended-latest'],
        jsxA11yPlugin.flatConfigs.recommended,
    ];
}

/**
 * Composite: {@link nextBaseConfig} when Next is enabled, the {@link reactBaseConfig} fallback
 * otherwise. Full evidence-based gate (see `nextGate` in gates.js), mirroring Tailwind: app-root
 * evidence (see {@link findNextRoots} - `next.config.*`, a `package.json` depending on `next`, a
 * `src/app`/`src/pages` tree) marks a Next repo even when the `next` package is installed only in
 * a leaf app (invisible to `hasNext()`) - and because `eslint-config-next` `require`s files INSIDE
 * the `next` package, `next` must be resolvable from the workspace root (hoisted); a leaf-only
 * install is a hard error with hoisting guidance (see `nextGate` in gates.js).
 *
 */
export async function nextConfig(option?: boolean | NextOptions, strict = false): Promise<Linter.Config[]> {
    const { enabled, options, files } = nextGate(option, strict);
    if (!enabled) return reactBaseConfig();

    // explicit rootDir is passed through in the consumer's own notation; auto-detected roots are
    // the evidence dirs (absolute; empty under strict → no settings block, the setting is optional)
    return nextBaseConfig({ ...options, rootDir: options.rootDir ?? files.map((file) => dirname(file)) });
}

/**
 * TypeScript blocks - lives here because the wiring stems from `eslint-config-next/typescript`
 * (typescript-eslint recommended setup, useful with or without Next itself) + deliberate overrides
 * of its rule set.
 *
 */
export function typescriptOverridesConfig(): Linter.Config[] {
    return [
        ...nextTs,
        {
            name: '@typescript-eslint overrides',
            files: [tsFiles],
            rules: {
                '@typescript-eslint/explicit-module-boundary-types': 'off',
                '@typescript-eslint/no-unused-vars': 'off', // superseded by 'unused-imports/no-unused-imports', which is actually autofixable
                ...typescriptRules,
            },
        },
        {
            name: '@typescript-eslint declaration-file overrides',
            files: ['**/*.d.ts'],
            rules: declarationFileRules,
        },
    ];
}

/**
 * Overrides of rules set by `eslint-config-next`. Always applied (not gated on Next): the
 * jsx-a11y/react entries matter for {@link reactBaseConfig} consumers too, and turning off rules of an
 * unregistered plugin is harmless.
 *
 */
export function nextOverridesConfig(): Linter.Config[] {
    return [
        {
            name: 'eslint-config-next overrides',
            rules: {
                ...nextRules,
                ...reactRules,
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
 */
export function reactSettingsConfig(): Linter.Config[] {
    return [
        {
            settings: {
                react: { version: '19' },
            },
        },
    ];
}

/**
 * The whole React family in its load-bearing order: {@link nextConfig} (Next when enabled, plain
 * React otherwise - Next is just a shortcut to an opinionated React/TypeScript setup), then
 * {@link typescriptOverridesConfig}, {@link nextOverridesConfig} and {@link reactSettingsConfig} -
 * which apply NO MATTER whether Next or plain React won, so composing them individually risks
 * ordering mistakes; defineLintConfig uses this composite.
 *
 */
export async function reactConfig(option?: boolean | NextOptions, strict = false): Promise<Linter.Config[]> {
    return [
        ...(await nextConfig(option, strict)),
        ...typescriptOverridesConfig(),
        ...nextOverridesConfig(),
        ...reactSettingsConfig(),
    ];
}
