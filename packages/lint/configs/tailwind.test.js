import assert from 'node:assert/strict';
import { test } from 'vitest';

import { inTempDir, TAILWIND_ENTRY, tailwindBlockOf } from '../testUtils.js';
import { findTailwindEntry, tailwindConfig } from './tailwind.js';

test('auto-detects a single entry CSS when forced on', async () => {
    await inTempDir({ 'app.css': TAILWIND_ENTRY }, async () => {
        const config = await tailwindConfig(true);
        const block = tailwindBlockOf(config);
        assert.ok(block, 'tailwind block expected');
        assert.ok(block.settings.tailwindcss.cssConfigPath.endsWith('app.css'));
    });
});

test('explicit cssConfigPath wins over detection', async () => {
    await inTempDir({ 'app.css': TAILWIND_ENTRY, 'other.css': TAILWIND_ENTRY }, async () => {
        const config = await tailwindConfig({ cssConfigPath: 'src/styles/tailwind.css' });
        assert.equal(tailwindBlockOf(config).settings.tailwindcss.cssConfigPath, 'src/styles/tailwind.css');
    });
});

test('forced on with no entry CSS fails loudly', async () => {
    await inTempDir({}, async () => {
        await assert.rejects(tailwindConfig(true), /no single Tailwind v4 entry CSS/);
    });
});

test('ambiguous entries fail loudly even in auto mode (a silent skip is hard to detect)', async () => {
    await inTempDir({ 'a.css': TAILWIND_ENTRY, 'b.css': TAILWIND_ENTRY }, async () => {
        await assert.rejects(tailwindConfig(), /several entry CSS candidates/);
        await assert.rejects(tailwindConfig(true), /several entry CSS candidates/);
        // explicit path resolves the ambiguity
        const config = await tailwindConfig({ cssConfigPath: 'a.css' });
        assert.equal(tailwindBlockOf(config).settings.tailwindcss.cssConfigPath, 'a.css');
    });
});

test('auto-detected but no entry CSS stays inert (no block, no error)', async () => {
    await inTempDir({}, async () => {
        // hasTailwind is true in this monorepo, so this exercises the detected-on + zero-entries path
        assert.deepEqual(await tailwindConfig(), []);
    });
});

test('scan reaches deep entries and ignores copies in build outputs', async () => {
    await inTempDir(
        {
            'packages/x/src/styles/app.css': TAILWIND_ENTRY, // 4 dirs deep - beyond the old 3-level scan
            'dist/app.css': TAILWIND_ENTRY, // compiled copy - would make the scan ambiguous if not excluded
            '.next/static/app.css': TAILWIND_ENTRY,
        },
        async () => {
            const config = await tailwindConfig(true);
            assert.ok(
                tailwindBlockOf(config).settings.tailwindcss.cssConfigPath.endsWith('packages/x/src/styles/app.css'),
            );
        },
    );
});

// the generic off/forced/strict gate mechanics are covered by the toolGate tests in lib.test.js

test('findTailwindEntry: single entry found, ambiguous returns null', async () => {
    await inTempDir({ 'app.css': TAILWIND_ENTRY, 'plain.css': 'body {}\n' }, async () => {
        assert.ok(findTailwindEntry([]).endsWith('app.css'));
    });
    await inTempDir({ 'a.css': TAILWIND_ENTRY, 'b.css': TAILWIND_ENTRY }, async () => {
        assert.equal(findTailwindEntry([]), null);
    });
});
