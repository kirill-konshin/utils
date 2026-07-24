import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import nextTs from 'eslint-config-next/typescript';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import { globSync } from 'glob';

import { findWorkspaceRoot, GLOBAL_IGNORES, hasNext, scanWorkspace, toolGate, tsExts } from '../lib.js';

// lazy so consumers without Next don't pay the load cost - re-exported from index.js
export const nextPlugin = hasNext ? (await import('@next/eslint-plugin-next')).default : null;

/** @typedef {import('../index.js').NextOptions} NextOptions Defined in index.d.ts. */

/**
 * Does this `package.json` declare `next` as a dependency? Peer/optional declarations are
 * deliberately ignored - they mark component libraries, not apps.
 *
 * @param {string} file absolute path of a `package.json`
 * @returns {boolean}
 */
function dependsOnNext(file) {
    try {
        const { dependencies, devDependencies } = JSON.parse(readFileSync(file, 'utf-8'));
        return Boolean(dependencies?.next ?? devDependencies?.next);
    } catch {
        return false; // unreadable / malformed - not evidence
    }
}

/**
 * Auto-find Next.js app roots below the workspace root (scanned like the Tailwind entry - see
 * `scanWorkspace`). `next.config.*` is optional in Next.js, so any of three signals marks an app
 * root:
 * - a `next.config.*` file
 * - a `package.json` depending on `next` (see {@link dependsOnNext})
 * - a `src/app` or `src/pages` directory - the reported root is the directory CONTAINING `src`,
 *   because the plugin resolves both layouts (`pages`/`app` and `src/pages`/`src/app`) from the
 *   package root itself; the bare root-level dir names are too generic to scan for, but such apps
 *   are caught by the other two signals
 *
 * @param {string[]} ignores glob patterns to skip
 * @returns {string[]} absolute directories, deduplicated (one app usually shows several signals) and
 *   sorted so the emitted settings block is deterministic across filesystems
 */
export function findNextRoots(ignores) {
    return [
        ...new Set([
            ...scanWorkspace('next.config.*', ignores).map((file) => dirname(file)),
            ...scanWorkspace('package.json', ignores)
                .filter(dependsOnNext)
                .map((file) => dirname(file)),
            // the trailing slash makes glob match directories only
            ...scanWorkspace('src/{app,pages}/', ignores).map((dir) => dirname(dirname(dir))),
        ]),
    ].sort();
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
export function reactBaseConfig() {
    return [
        reactPlugin.configs.flat.recommended,
        reactPlugin.configs.flat['jsx-runtime'],
        reactHooksPlugin.configs.flat['recommended-latest'],
        jsxA11yPlugin.flatConfigs.recommended,
    ];
}

/**
 * Composite: {@link nextBaseConfig} when Next is enabled, the {@link reactBaseConfig} fallback
 * otherwise. Full evidence-based gate (see `toolGate` in lib.js), mirroring Tailwind: app-root
 * evidence (see {@link findNextRoots} - `next.config.*`, a `package.json` depending on `next`, a
 * `src/app`/`src/pages` tree) marks a Next repo even when the `next` package is installed only in
 * a leaf app (invisible to `hasNext`) - and because `eslint-config-next` `require`s files INSIDE
 * the `next` package, `next` must be resolvable from the workspace root (hoisted); a leaf-only
 * install is a hard error with hoisting guidance (see `toolGate` in lib.js).
 *
 * @param {boolean | NextOptions} [option] the defineLintConfig `next` flag
 * @param {boolean} [strict] same-scope detection only - no `next.config.*` scan (defineLintConfig `detection.strict`)
 * @returns {Promise<import('eslint').Linter.Config[]>}
 */
export async function nextConfig(option, strict = false) {
    const { enabled, options, files } = toolGate(option, strict, {
        tool: 'next',
        has: hasNext,
        packageName: 'next',
        /*
         * rootDir entries may be relative or absolute paths OR globs (`apps/*` - the plugin
         * expands them itself for its settings), so for the evidence probes each entry is
         * expanded against the workspace root into real app dirs; a plain path that exists simply
         * matches itself. An entry matching nothing falls back to the literal path as the probe
         * anchor (harmless - resolution just walks up from there). The probes resolve from each
         * app's package.json.
         */
        absolutizeOptions: ({ rootDir }) =>
            (Array.isArray(rootDir) ? rootDir : [rootDir]).filter(Boolean).flatMap((dir) => {
                const pattern = isAbsolute(dir) ? dir : resolve(findWorkspaceRoot(), dir);
                // trailing slash = directories only; backslash normalization mirrors the plugin
                const dirs = globSync(`${pattern.replace(/\\/g, '/').replace(/\/+$/, '')}/`, { absolute: true });
                return (dirs.length > 0 ? dirs : [pattern]).map((appDir) => join(appDir, 'package.json'));
            }),
        scan: () => findNextRoots(GLOBAL_IGNORES).map((dir) => join(dir, 'package.json')),
    });
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
 * jsx-a11y/react entries matter for {@link reactBaseConfig} consumers too, and turning off rules of an
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

/**
 * The whole React family in its load-bearing order: {@link nextConfig} (Next when enabled, plain
 * React otherwise - Next is just a shortcut to an opinionated React/TypeScript setup), then
 * {@link typescriptOverridesConfig}, {@link nextOverridesConfig} and {@link reactSettingsConfig} -
 * which apply NO MATTER whether Next or plain React won, so composing them individually risks
 * ordering mistakes; defineLintConfig uses this composite.
 *
 * @param {boolean | NextOptions} [option] the defineLintConfig `next` flag
 * @param {boolean} [strict] same-scope detection only (defineLintConfig `detection.strict`)
 * @returns {Promise<import('eslint').Linter.Config[]>}
 */
export async function reactConfig(option, strict = false) {
    return [
        ...(await nextConfig(option, strict)),
        ...typescriptOverridesConfig(),
        ...nextOverridesConfig(),
        ...reactSettingsConfig(),
    ];
}
