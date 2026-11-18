import assert from 'node:assert/strict';
import { test, vi } from 'vite-plus/test';

import { hasNxRuleIn, inTempDir } from '../testUtils.js';
import { nxConfig } from './nx.js';

// the plugins load on demand, in the first test that builds their block: slow under a full parallel run
vi.setConfig({ testTimeout: 30_000 });

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
