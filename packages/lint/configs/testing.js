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
import fs from 'node:fs';
import path from 'node:path';
import vitestPlugin from '@vitest/eslint-plugin';
import jestPlugin from 'eslint-plugin-jest';

import { asOptions, hasJest, hasVitest, tsExts, tsExtsRaw } from '../lib.js';

export { jestPlugin, vitestPlugin };

// derived from the shared extension list - one source of truth with the lint file globs
const SOURCE_EXTS = tsExtsRaw.split(',').map((ext) => `.${ext}`);
const TEST_SUFFIX = new RegExp(`\\.test\\.(${tsExtsRaw.replaceAll(',', '|')})$`);

/**
 * Custom rule (registered as `local/test-colocation` by {@link testConfig}). Only `*.test.*` is
 * checked, not `*.spec.*` - per testing.md, spec files cover e2e/integration flows that don't map
 * 1:1 to a single sibling source file, so co-location isn't meaningful there.
 */
const testColocation = {
    meta: {
        type: 'problem',
        docs: {
            description: 'require *.test.* files to sit next to the source file they test, not in a separate folder',
        },
        schema: [],
        messages: {
            missingSibling:
                "No sibling source file found for '{{testFile}}'. Expected e.g. '{{expected}}' in the same directory, not a separate __tests__/ folder.",
        },
    },
    create(context) {
        const base = path.basename(context.filename);
        const match = base.match(TEST_SUFFIX);

        if (!match) return {};

        const stem = base.slice(0, -match[0].length);

        let siblings;
        try {
            siblings = fs.readdirSync(path.dirname(context.filename));
        } catch {
            return {}; // virtual filename (stdin, editor buffer) - no directory to check against
        }

        if (SOURCE_EXTS.some((ext) => siblings.includes(`${stem}${ext}`))) return {};

        return {
            Program(node) {
                context.report({
                    node,
                    messageId: 'missingSibling',
                    data: { testFile: base, expected: `${stem}.ts` },
                });
            },
        };
    },
};

/**
 * Jest recommended rules, scoped to test files.
 *
 * @param {boolean | import('../index.js').ToggleOptions} [option] the defineLintConfig `jest` flag; auto-detected when omitted
 * @returns {import('eslint').Linter.Config[]}
 */
export function jestConfig(option) {
    const { enabled = hasJest } = asOptions(option);
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
 * @param {boolean | import('../index.js').ToggleOptions} [option] the defineLintConfig `vitest` flag; auto-detected when omitted
 * @returns {import('eslint').Linter.Config[]}
 */
export function vitestConfig(option) {
    const { enabled = hasVitest } = asOptions(option);
    if (!enabled) return [];
    return [
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
    ];
}

/**
 * Runner-agnostic test rules: pure AST/call-name checking, needs neither jest nor vitest installed
 * to work correctly, so it applies regardless of which one (if either) is present.
 *
 * @returns {import('eslint').Linter.Config[]}
 */
export function testConfig() {
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
