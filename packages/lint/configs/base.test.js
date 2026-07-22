import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'vitest';

import { inTempDir } from '../testUtils.js';
import { defaultIgnoreConfig } from './base.js';

test('defaultIgnoreConfig: off by default, with false, and with enabled: false', () => {
    assert.deepEqual(defaultIgnoreConfig(), []);
    assert.deepEqual(defaultIgnoreConfig(false), []);
    assert.deepEqual(defaultIgnoreConfig({ enabled: false }), []);
});

test('defaultIgnoreConfig: enabled without importMetaUrl fails loudly', () => {
    assert.throws(() => defaultIgnoreConfig(true), /importMetaUrl/);
    assert.throws(() => defaultIgnoreConfig({}), /importMetaUrl/);
});

test('defaultIgnoreConfig: converts .gitignore and .prettierignore next to the config file', async () => {
    await inTempDir({ '.gitignore': 'dist\n', '.prettierignore': 'coverage\n' }, async (dir) => {
        const configs = defaultIgnoreConfig({
            importMetaUrl: pathToFileURL(join(dir, 'eslint.config.mjs')).href,
        });
        assert.equal(configs.length, 2);
        assert.ok(configs[0].ignores.some((pattern) => pattern.includes('dist')));
        assert.ok(configs[1].ignores.some((pattern) => pattern.includes('coverage')));
    });
});
