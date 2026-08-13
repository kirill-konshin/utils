import assert from 'node:assert/strict';
import { test } from 'vitest';

import { findWorkspaceRoot } from '../index.js';
import { typeAwareConfig } from './typescriptTypeAware.js';

test('off by default; true enables with workspace-root tsconfigRootDir and bare projectService', () => {
    assert.deepEqual(typeAwareConfig(), []);
    assert.deepEqual(typeAwareConfig(false), []);

    const [block] = typeAwareConfig(true);
    assert.deepEqual(block.languageOptions.parserOptions, {
        projectService: {},
        tsconfigRootDir: findWorkspaceRoot(),
    });
});

test('projectService options and tsconfigRootDir land in parserOptions', () => {
    const [block] = typeAwareConfig({
        allowDefaultProject: ['vite.config.ts', '*/vite.config.ts'],
        maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 50,
        tsconfigRootDir: '/somewhere',
    });
    assert.deepEqual(block.languageOptions.parserOptions, {
        projectService: {
            allowDefaultProject: ['vite.config.ts', '*/vite.config.ts'],
            maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 50,
        },
        tsconfigRootDir: '/somewhere',
    });
});

test('maximumDefaultProjectFileMatchCount defaults to the allowDefaultProject length', () => {
    const [block] = typeAwareConfig({ allowDefaultProject: ['a.config.ts', 'b.config.ts', 'c.config.ts'] });
    assert.equal(
        block.languageOptions.parserOptions.projectService
            .maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING,
        3,
    );

    const [explicit] = typeAwareConfig({
        allowDefaultProject: ['a.config.ts'],
        maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 50,
    });
    assert.equal(
        explicit.languageOptions.parserOptions.projectService
            .maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING,
        50,
    );
});

test('absolute allowDefaultProject entries (e.g. from scanWorkspace) are relativized to tsconfigRootDir', () => {
    const [block] = typeAwareConfig({
        allowDefaultProject: ['/ws/packages/x/vite.config.ts', 'vitest.config.ts'],
        tsconfigRootDir: '/ws',
    });
    assert.deepEqual(block.languageOptions.parserOptions.projectService.allowDefaultProject, [
        'packages/x/vite.config.ts',
        'vitest.config.ts',
    ]);
});
