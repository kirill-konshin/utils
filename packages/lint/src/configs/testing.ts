/*
 * jest/vitest plugins are statically imported even though their recommended sets are gated:
 * the runner-agnostic testConfig() registers both plugins unconditionally (its rules are pure
 * AST checks that work without the runner installed).
 *
 * Each test-runner's recommended rule set is gated on the runner actually being installed - per
 * rules/testing.md ("if project use vite use vitest, otherwise jest"), a project normally has
 * exactly one of these, and applying the other runner's correctness rules to it would be
 * conceptually wrong (even if mechanically harmless, since the rule namespaces don't collide).
 */
import vitestPlugin from '@vitest/eslint-plugin';
import type { Linter } from 'eslint';
import jestPlugin from 'eslint-plugin-jest';

import type { ToggleOptions } from '../config.js';
import { tsExts } from '../exts.js';
import { jestGate, vitestGate } from '../gates.js';
import { testColocation } from '../testColocation.js';

export { jestPlugin, vitestPlugin };

/*
 * Both runners use the evidence-based gates (`jestGate`, `vitestGate` in gates.js): a runner config file marks the repo
 * even when the runner is installed only in a leaf package (invisible to the `has*` probe), and
 * the runner package itself must then be resolvable - eslint-plugin-jest sniffs the installed
 * `jest` version (jest/no-deprecated-functions) - so leaf-only installs are bridged. Unlike the
 * plugin-crashing tools (next/storybook/tailwind) the rules are pure AST checks that work without
 * the runner, so forcing a runner on never throws (`requirePackage: false`).
 */

/**
 * Jest recommended rules, scoped to test files.
 *
 */
export function jestConfig(option?: boolean | ToggleOptions, strict = false): Linter.Config[] {
    const { enabled } = jestGate(option, strict);
    if (!enabled) return [];
    return [
        {
            ...jestPlugin.configs['flat/recommended'],
            name: 'Jest Rules',
            files: [`**/*.{test,spec}.${tsExts}`],
        },
    ];
}

/**
 * Vitest recommended rules + globals, scoped to test files.
 *
 */
export function vitestConfig(option?: boolean | ToggleOptions, strict = false): Linter.Config[] {
    const { enabled } = vitestGate(option, strict);
    if (!enabled) return [];
    return [
        {
            ...vitestPlugin.configs.recommended,
            name: 'Vitest Rules',
            files: [`**/*.{test,spec}.${tsExts}`],
            rules: {
                ...vitestPlugin.configs.recommended.rules,
                // `expectTypeOf` and `assertType` are assertions too: a type test proves its contract without a runtime
                // expect. Listed here rather than through the plugin's `typecheck` setting, which makes other rules demand
                // type information.
                'vitest/expect-expect': [
                    'error',
                    { assertFunctionNames: ['expect', 'assert', 'expectTypeOf', 'assertType'] },
                ],
            },
        },
        {
            ...vitestPlugin.configs.env,
            name: 'Vitest globals',
            files: [`**/*.{test,spec}.${tsExts}`],
        },
    ];
}

/**
 * Runner-agnostic test rules: pure AST/call-name checking, needs neither jest nor vitest installed
 * to work correctly, so it applies regardless of which one (if either) is present.
 *
 */
export function testConfig(): Linter.Config[] {
    return [
        {
            name: 'Test rules',
            files: [`**/*.{test,spec}.${tsExts}`],
            plugins: {
                jest: jestPlugin,
                vitest: vitestPlugin,
                local: { rules: { 'test-colocation': testColocation } },
            },
            rules: {
                'jest/consistent-test-it': ['error', { fn: 'test' }],
                'vitest/consistent-test-it': ['error', { fn: 'test' }],
                'local/test-colocation': 'error',
                'jest/no-disabled-tests': 'warn',
                'vitest/no-disabled-tests': 'warn',
            },
        },
    ];
}
