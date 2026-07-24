import assert from 'node:assert/strict';
import { test } from 'vitest';

import { hasNxRuleIn, inTempDir } from '../testUtils.js';
import { nxConfig } from './nx.js';

test('true/false/enabled: false override detection', async () => {
    assert.ok(hasNxRuleIn(await nxConfig(true)));
    assert.deepEqual(await nxConfig(false), []);
    assert.deepEqual(await nxConfig({ enabled: false }), []);
});

test('strict detection checks nx.json at cwd, not the workspace root', async () => {
    await inTempDir({}, async () => {
        assert.deepEqual(await nxConfig(undefined, true), []);
    });
    await inTempDir({ 'nx.json': '{}' }, async () => {
        assert.ok(hasNxRuleIn(await nxConfig(undefined, true)));
    });
});
