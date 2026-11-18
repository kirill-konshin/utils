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
import { dirname } from 'node:path';
import vitestPlugin from '@vitest/eslint-plugin';
import type { Linter } from 'eslint';
import jestPlugin from 'eslint-plugin-jest';
import { getPackageInfoSync } from 'local-pkg';

import type { ToggleOptions } from '../config.js';
import { testRunnerRules, vitestRules } from '../conventions.js';
import { testFiles } from '../exts.js';
import { jestGate, vitestGate } from '../gates.js';
import { hasJest } from '../lib.js';
import { testColocation } from '../testColocation.js';

export { jestPlugin, vitestPlugin };

/*
 * Both runners use the evidence-based gates (`jestGate`, `vitestGate` in gates.js): a runner config file marks the repo
 * even when the runner is installed only in a leaf package (invisible to the `has*` probe). Unlike the plugin-crashing
 * tools (next/storybook/tailwind) the rules are pure AST checks that work without the runner, so forcing a runner on
 * never throws (`requirePackage: false`).
 */

/**
 * The major version `jest/no-deprecated-functions` needs, when eslint-plugin-jest cannot find `jest` itself (it
 * resolves `jest` from its own install, the workspace root): read from the install next to a Jest config file. `null`
 * when there is none anywhere - the rule would throw, so it goes off; `undefined` when the plugin finds `jest` itself.
 */
function jestVersion(configFiles: string[]): number | null | undefined {
    if (hasJest()) return undefined;

    const version = configFiles
        .map((file) => getPackageInfoSync('jest', { paths: [dirname(file)] })?.version)
        .find(Boolean);
    return version ? Number.parseInt(version, 10) : null;
}

/**
 * Jest recommended rules, scoped to test files.
 *
 */
export function jestConfig(option?: boolean | ToggleOptions, strict = false): Linter.Config[] {
    const { enabled, files } = jestGate(option, strict);
    if (!enabled) return [];

    const version = jestVersion(files);
    const recommended = jestPlugin.configs['flat/recommended'];
    return [
        {
            ...recommended,
            name: 'Jest Rules',
            files: [testFiles],
            ...(version ? { settings: { jest: { version } } } : {}),
            ...(version === null
                ? { rules: { ...recommended.rules, 'jest/no-deprecated-functions': 'off' as const } }
                : {}),
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
            files: [testFiles],
            rules: { ...vitestPlugin.configs.recommended.rules, ...vitestRules },
        },
        {
            ...vitestPlugin.configs.env,
            name: 'Vitest globals',
            files: [testFiles],
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
            files: [testFiles],
            plugins: {
                jest: jestPlugin,
                vitest: vitestPlugin,
                local: { rules: { 'test-colocation': testColocation } },
            },
            rules: { ...testRunnerRules('jest'), ...testRunnerRules('vitest'), 'local/test-colocation': 'error' },
        },
    ];
}
