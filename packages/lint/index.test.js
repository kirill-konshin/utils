import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
    baseConfig,
    defaultIgnoreConfig,
    defineLintConfig,
    importSortConfig,
    importXConfig,
    jestConfig,
    nextBaseConfig,
    nextConfig,
    nextOverridesConfig,
    nxConfig,
    prettierConfig,
    promiseConfig,
    reactConfig,
    reactSettingsConfig,
    storybookConfig,
    tailwindConfig,
    testConfig,
    turboConfig,
    typeAwareConfig,
    typescriptOverridesConfig,
    unicornConfig,
    unusedImportsConfig,
    vitestConfig,
} from './index.js';
import { inTempDir, TAILWIND_ENTRY, tailwindBlockOf } from './testUtils.js';

test('tool options flow through defineLintConfig to the blocks', async () => {
    await inTempDir({ 'app.css': TAILWIND_ENTRY }, async () => {
        const on = await defineLintConfig();
        assert.ok(tailwindBlockOf(on).settings.tailwindcss.cssConfigPath.endsWith('app.css'));

        const off = await defineLintConfig({ tailwind: false });
        assert.equal(tailwindBlockOf(off), undefined);

        const offViaEnabled = await defineLintConfig({ tailwind: { enabled: false } });
        assert.equal(tailwindBlockOf(offViaEnabled), undefined);
    });
});

test('typeAware is off by default and enabled via the flag', async () => {
    await inTempDir({}, async () => {
        const isTypeAware = (config) => config.some((block) => block?.name?.startsWith('Type-aware rules'));
        assert.ok(!isTypeAware(await defineLintConfig()));
        assert.ok(isTypeAware(await defineLintConfig({ typeAware: { enabled: true } })));

        // its naming-convention warn must lose to the default-export exemption (last-wins ordering)
        const names = (await defineLintConfig({ typeAware: true })).map((block) => block?.name);
        const typeAwareAt = names.findIndex((name) => name?.startsWith('Type-aware rules'));
        assert.ok(typeAwareAt >= 0 && typeAwareAt < names.indexOf('Default export overrides'));
    });
});

test('options can be a function or an async function', async () => {
    await inTempDir({ 'app.css': TAILWIND_ENTRY }, async () => {
        const fromFn = await defineLintConfig(() => ({ tailwind: false }));
        assert.equal(tailwindBlockOf(fromFn), undefined);

        const fromAsyncFn = await defineLintConfig(async () => ({ tailwind: { cssConfigPath: 'x.css' } }));
        assert.equal(tailwindBlockOf(fromAsyncFn).settings.tailwindcss.cssConfigPath, 'x.css');
    });
});

test('every block function returns a non-empty array of config objects', async () => {
    // gated blocks are forced on (`true` / explicit options) so the assertion is machine-independent
    const blocks = {
        baseConfig: baseConfig(),
        defaultIgnoreConfig: inTempDir({ '.gitignore': 'dist\n', '.prettierignore': 'coverage\n' }, (dir) =>
            defaultIgnoreConfig({ importMetaUrl: new URL(`file://${dir}/eslint.config.mjs`).href }),
        ),
        nextBaseConfig: nextBaseConfig(),
        nextConfig: nextConfig(true),
        reactConfig: reactConfig(),
        typescriptOverridesConfig: typescriptOverridesConfig(),
        nextOverridesConfig: nextOverridesConfig(),
        reactSettingsConfig: reactSettingsConfig(),
        prettierConfig: prettierConfig(),
        storybookConfig: storybookConfig(true),
        importXConfig: importXConfig(),
        importSortConfig: importSortConfig(),
        unusedImportsConfig: unusedImportsConfig(),
        promiseConfig: promiseConfig(),
        unicornConfig: unicornConfig(),
        typeAwareConfig: typeAwareConfig(true),
        turboConfig: turboConfig(true),
        tailwindConfig: tailwindConfig({ cssConfigPath: 'x.css' }),
        nxConfig: nxConfig(true),
        jestConfig: jestConfig(true),
        vitestConfig: vitestConfig(true),
        testConfig: testConfig(),
    };
    for (const [name, pending] of Object.entries(blocks)) {
        const configs = await pending;
        assert.ok(Array.isArray(configs), `${name} should return an array`);
        assert.ok(configs.length > 0, `${name} should return at least one block`);
        for (const config of configs) {
            assert.ok(config && typeof config === 'object', `${name} entries should be config objects`);
        }
    }
});
