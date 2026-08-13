import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'vitest';

import { hasNextPluginIn, inTempDir, nextSettingsBlockOf } from '../testUtils.js';
import { nextConfig, reactConfig } from './react.js';

test('explicit rootDir lands in settings.next.rootDir and skips the scan', async () => {
    const config = await nextConfig({ rootDir: 'apps/web' });
    assert.ok(hasNextPluginIn(config), '@next/next plugin expected');
    assert.equal(nextSettingsBlockOf(config).settings.next.rootDir, 'apps/web');
});

test('explicit rootDir globs pass through to settings untouched (the plugin expands them itself)', async () => {
    await inTempDir({ 'apps/a/next.config.js': '', 'apps/b/package.json': '{}' }, async () => {
        const config = await nextConfig({ rootDir: ['apps/*', 'standalone'] });
        assert.deepEqual(nextSettingsBlockOf(config).settings.next.rootDir, ['apps/*', 'standalone']);
    });
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

test('no app-root evidence found stays without settings (rootDir is optional)', async () => {
    await inTempDir({ 'packages/lib/package.json': '{"dependencies":{"react":"19.0.0"}}' }, async () => {
        const config = await nextConfig(true);
        assert.ok(hasNextPluginIn(config));
        assert.equal(nextSettingsBlockOf(config), undefined);
    });
});

test('rootDir detected from a package.json depending on next (no next.config.*)', async () => {
    await inTempDir(
        {
            'apps/web/package.json': '{"dependencies":{"next":"16.0.0"}}',
            'apps/dev/package.json': '{"devDependencies":{"next":"16.0.0"}}',
            'packages/ui/package.json': '{"peerDependencies":{"next":">=15"}}', // library, not an app
        },
        async () => {
            const { rootDir } = nextSettingsBlockOf(await nextConfig(true)).settings.next;
            assert.deepEqual(rootDir, [join(process.cwd(), 'apps/dev'), join(process.cwd(), 'apps/web')]);
        },
    );
});

test('rootDir detected from src/app and src/pages trees is the package root, not src', async () => {
    await inTempDir(
        {
            'apps/a/src/app/layout.tsx': '',
            'apps/b/src/pages/index.tsx': '',
            'packages/lib/src/pages.ts': '', // a file named like the marker dir must not count
        },
        async () => {
            const { rootDir } = nextSettingsBlockOf(await nextConfig(true)).settings.next;
            assert.deepEqual(rootDir, [join(process.cwd(), 'apps/a'), join(process.cwd(), 'apps/b')]);
        },
    );
});

test('several signals in one app yield one root', async () => {
    await inTempDir(
        {
            'apps/web/next.config.ts': '',
            'apps/web/package.json': '{"dependencies":{"next":"16.0.0"}}',
            'apps/web/src/app/layout.tsx': '',
        },
        async () => {
            const { rootDir } = nextSettingsBlockOf(await nextConfig(true)).settings.next;
            assert.deepEqual(rootDir, [join(process.cwd(), 'apps/web')]);
        },
    );
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

test('reactConfig composite: family blocks apply for both Next and plain React', async () => {
    await inTempDir({}, async () => {
        for (const flag of [true, false]) {
            const config = await reactConfig(flag);
            assert.equal(hasNextPluginIn(config), flag);
            assert.ok(config.some((block) => block?.name === '@typescript-eslint overrides'));
            assert.ok(config.some((block) => block?.name === 'eslint-config-next overrides'));
            assert.ok(config.some((block) => block?.settings?.react?.version));
        }
    });
});
