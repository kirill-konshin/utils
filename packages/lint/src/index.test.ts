import assert from 'node:assert/strict';
import { ESLint, type Linter } from 'eslint';
import { test } from 'vite-plus/test';

import {
    baseConfig,
    defaultIgnoreConfig,
    eslintConfig,
    importSortConfig,
    importXConfig,
    jestConfig,
    nextBaseConfig,
    nextConfig,
    nextOverridesConfig,
    nxConfig,
    prettierConfig,
    promiseConfig,
    reactBaseConfig,
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
import { hasTailwindBlockIn, inTempDir, TAILWIND_ENTRY, tailwindBlockOf } from './testUtils.js';

test('tool options flow through eslintConfig to the blocks', async () => {
    await inTempDir({ 'app.css': TAILWIND_ENTRY }, async () => {
        const on = await eslintConfig();
        assert.ok(tailwindBlockOf(on).settings.tailwindcss.cssConfigPath.endsWith('app.css'));

        const off = await eslintConfig({ tailwind: false });
        assert.ok(!hasTailwindBlockIn(off));

        const offViaEnabled = await eslintConfig({ tailwind: { enabled: false } });
        assert.ok(!hasTailwindBlockIn(offViaEnabled));
    });
});

test('typeAware is off by default and enabled via the flag', async () => {
    await inTempDir({}, async () => {
        const isTypeAware = (config: Linter.Config[]) =>
            config.some((block) => block?.name?.startsWith('Type-aware rules'));
        assert.ok(!isTypeAware(await eslintConfig()));
        assert.ok(isTypeAware(await eslintConfig({ eslint: { typeAware: { enabled: true } } })));

        // its naming-convention warn must lose to the default-export exemption (last-wins ordering)
        const names = (await eslintConfig({ eslint: { typeAware: true } })).map((block) => block?.name);
        const typeAwareAt = names.findIndex((name) => name?.startsWith('Type-aware rules'));
        assert.ok(typeAwareAt >= 0 && typeAwareAt < names.indexOf('Default export overrides'));
    });
});

test('detection: false turns tools off unless explicitly enabled', async () => {
    await inTempDir({ 'app.css': TAILWIND_ENTRY }, async () => {
        const off = await eslintConfig({ detection: false });
        assert.ok(!hasTailwindBlockIn(off));
        assert.ok(!off.some((block) => block?.plugins?.['@next/next']));
        assert.ok(off.some((block) => block?.plugins?.react)); // next off → react fallback

        // an explicitly enabled tool still auto-detects its settings (entry scan)
        const on = await eslintConfig({ detection: false, tailwind: true });
        assert.ok(tailwindBlockOf(on).settings.tailwindcss.cssConfigPath.endsWith('app.css'));
    });
});

test('detection: strict skips scans and requires explicit settings', async () => {
    await inTempDir({ 'a.css': TAILWIND_ENTRY, 'b.css': TAILWIND_ENTRY }, async () => {
        // ambiguous entries would be a hard error in auto mode; strict + explicit path works because nothing is scanned
        const explicit = await eslintConfig({ detection: { strict: true }, tailwind: { cssConfigPath: 'x.css' } });
        assert.equal(tailwindBlockOf(explicit).settings.tailwindcss.cssConfigPath, 'x.css');

        // hasTailwind is true in this monorepo → tailwind is on, but strict cannot scan for the entry
        await assert.rejects(eslintConfig({ detection: { strict: true } }), /strict detection/);

        // strict-off: everything is explicit-only
        const off = await eslintConfig({ detection: { enabled: false, strict: true } });
        assert.ok(!hasTailwindBlockIn(off));
        assert.ok(off.some((block) => block?.plugins?.react));
    });
});

test('lint.config.ts in the workspace root is the base, the overrides win', async () => {
    await inTempDir(
        { 'app.css': TAILWIND_ENTRY, 'lint.config.ts': "export default { tailwind: { cssConfigPath: 'x.css' } };\n" },
        async () => {
            assert.equal(tailwindBlockOf(await eslintConfig()).settings.tailwindcss.cssConfigPath, 'x.css');
            assert.ok(!hasTailwindBlockIn(await eslintConfig({ tailwind: false })));
        },
    );
});

test('every block function returns a non-empty array of config objects', async () => {
    // gated blocks are forced on (`true` / explicit options) so the assertion is machine-independent
    const blocks = {
        baseConfig: baseConfig(),
        defaultIgnoreConfig: inTempDir({ '.gitignore': 'dist\n', '.prettierignore': 'coverage\n' }, async (dir) =>
            defaultIgnoreConfig({ importMetaUrl: new URL(`file://${dir}/eslint.config.mjs`).href }),
        ),
        nextBaseConfig: nextBaseConfig(),
        nextConfig: nextConfig(true),
        reactBaseConfig: reactBaseConfig(),
        reactConfig: reactConfig(true),
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

test('the spec-tools bundle lint-prepare links into the agent dirs is never linted', async () => {
    await inTempDir({ '.keep': '' }, async (cwd) => {
        const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: baseConfig() });
        for (const dir of ['.agents', '.claude'])
            assert.ok(await eslint.isPathIgnored(`${dir}/skills/spec-tools/scripts/cli.js`), dir);
        assert.ok(!(await eslint.isPathIgnored('.agents/skills/own/scripts/run.js')));
    });
});
