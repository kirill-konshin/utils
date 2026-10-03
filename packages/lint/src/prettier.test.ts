import assert from 'node:assert/strict';
import { test } from 'vitest';

import { packagesLoadedBy } from './testUtils.js';

test('the ./prettier entry loads no dependency - Prettier does not pay for the ESLint plugins', () => {
    assert.deepEqual(packagesLoadedBy('prettier.js'), []);
});
