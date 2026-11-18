import assert from 'node:assert/strict';
import { Linter } from 'eslint';
import { test, vi } from 'vite-plus/test';

import { inTempDir } from '../testUtils.js';
import { jestConfig, vitestConfig } from './testing.js';

// the plugins load on demand, in the first test that builds their block: slow under a full parallel run
vi.setConfig({ testTimeout: 30_000 });

const untestedBlocks = (code: string): number =>
    new Linter({ configType: 'flat' })
        .verify(code, vitestConfig(true), { filename: 'src/a.test.js' })
        .filter((message) => message.ruleId === 'vitest/expect-expect').length;

test('vitest: a type assertion counts as the assertion a test needs', () => {
    assert.equal(untestedBlocks("test('t', () => { expectTypeOf(1).toBeNumber(); });\n"), 0);
    assert.equal(untestedBlocks("test('t', () => { assertType(1); });\n"), 0);
    assert.equal(untestedBlocks("test('t', () => { const unused = 1; });\n"), 1);
});

test('jest: the version comes from a leaf install the plugin cannot see; none anywhere turns its one rule off', async () => {
    const jest = (version: string) => ({
        'app/node_modules/jest/package.json': JSON.stringify({ name: 'jest', version, main: 'index.js' }),
        'app/node_modules/jest/index.js': '',
    });
    const settingsOf = (config: Linter.Config[]) => config[0];

    await inTempDir({ 'app/jest.config.js': '', ...jest('29.7.0') }, async () => {
        assert.deepEqual(settingsOf(jestConfig(true)).settings, { jest: { version: 29 } });
        assert.notEqual(settingsOf(jestConfig(true)).rules?.['jest/no-deprecated-functions'], 'off');
    });
    await inTempDir({ 'app/jest.config.js': '' }, async () => {
        assert.equal(settingsOf(jestConfig(true)).rules?.['jest/no-deprecated-functions'], 'off');
    });
});
