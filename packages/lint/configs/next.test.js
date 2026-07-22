import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'vitest';

import { hasNextPluginIn, inTempDir, nextSettingsBlockOf } from '../testUtils.js';
import { nextConfig } from './next.js';

test('explicit rootDir lands in settings.next.rootDir and skips the scan', async () => {
    const config = await nextConfig({ rootDir: 'apps/web' });
    assert.ok(hasNextPluginIn(config), '@next/next plugin expected');
    assert.equal(nextSettingsBlockOf(config).settings.next.rootDir, 'apps/web');
});

test('rootDir auto-detected from a single next.config.*', async () => {
    await inTempDir({ 'next.config.js': '' }, async () => {
        const { rootDir } = nextSettingsBlockOf(await nextConfig(true)).settings.next;
        assert.deepEqual(rootDir, [process.cwd()]);
    });
});

test('several apps produce all roots as an array', async () => {
    await inTempDir({ 'apps/a/next.config.js': '', 'apps/b/next.config.mjs': '' }, async () => {
        const { rootDir } = nextSettingsBlockOf(await nextConfig(true)).settings.next;
        assert.deepEqual(rootDir.sort(), [join(process.cwd(), 'apps/a'), join(process.cwd(), 'apps/b')]);
    });
});

test('a dir holding several next.config flavors yields one root', async () => {
    await inTempDir({ 'apps/a/next.config.js': '', 'apps/a/next.config.ts': '' }, async () => {
        const { rootDir } = nextSettingsBlockOf(await nextConfig(true)).settings.next;
        assert.deepEqual(rootDir, [join(process.cwd(), 'apps/a')]);
    });
});

test('no next.config.* found stays without settings (rootDir is optional)', async () => {
    await inTempDir({}, async () => {
        const config = await nextConfig(true);
        assert.ok(hasNextPluginIn(config));
        assert.equal(nextSettingsBlockOf(config), undefined);
    });
});

test('false and enabled: false fall back to the React blocks', async () => {
    for (const option of [false, { enabled: false, rootDir: 'apps/web' }]) {
        const config = await nextConfig(option);
        assert.ok(!hasNextPluginIn(config));
        assert.ok(
            config.some((block) => block?.plugins?.react),
            'react fallback expected',
        );
    }
});
