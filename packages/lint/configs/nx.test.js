import assert from 'node:assert/strict';
import { test } from 'vitest';

import { hasNxRuleIn } from '../testUtils.js';
import { nxConfig } from './nx.js';

test('true/false/enabled: false override detection', async () => {
    assert.ok(hasNxRuleIn(await nxConfig(true)));
    assert.deepEqual(await nxConfig(false), []);
    assert.deepEqual(await nxConfig({ enabled: false }), []);
});
