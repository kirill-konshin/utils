import assert from 'node:assert/strict';
import { test } from 'vitest';

import { tsExts } from './exts.js';
import { listStaged } from './lintStaged.js';
import { packagesLoadedBy } from './testUtils.js';

test('the ./lint-staged entry loads no dependency - a commit does not pay for the ESLint plugins', () => {
    assert.deepEqual(packagesLoadedBy('lintStaged.js'), []);
});

test('only code goes to ESLint - it skips markup with a warning, after its full startup', () => {
    const eslintGlobs = Object.entries(listStaged).filter(([, tasks]) => tasks.includes('node --run eslint --'));
    assert.deepEqual(
        eslintGlobs.map(([glob]) => glob),
        [`*.${tsExts}`],
    );
});

test('tasks run the package.json scripts through node --run - Yarn would load the project state for each', () => {
    for (const task of Object.values(listStaged).flat()) assert.match(task, /^node --run (eslint|prettier) --$/);
});
