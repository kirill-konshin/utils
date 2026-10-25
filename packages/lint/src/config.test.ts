import assert from 'node:assert/strict';
import { test } from 'vite-plus/test';

import { DEFAULT_LINT_CONFIG, defineLintConfig, loadLintConfig, mergeLintConfig, resolveLintConfig } from './config.js';
import { inTempDir, packagesLoadedBy } from './testUtils.js';

test('defineLintConfig returns the config as it is', () => {
    const config = { tailwind: false, skills: { 'shadcn/ui': true } };
    assert.equal(defineLintConfig(config), config);
});

test('mergeLintConfig: objects merge deep, arrays and values are replaced', () => {
    assert.deepEqual(
        mergeLintConfig({ next: { rootDir: ['a', 'b'] }, eslint: { typeAware: false } }, { next: { rootDir: ['c'] } }),
        { next: { rootDir: ['c'] }, eslint: { typeAware: false } },
    );
});

test('mergeLintConfig: a boolean over options keeps them and sets enabled, options over a boolean replace it', () => {
    assert.deepEqual(mergeLintConfig({ skills: { x: { ref: 'v1' } } }, { skills: { x: false } }), {
        skills: { x: { ref: 'v1', enabled: false } },
    });
    assert.deepEqual(mergeLintConfig({ tailwind: false }, { tailwind: { cssConfigPath: 'a.css' } }), {
        tailwind: { cssConfigPath: 'a.css' },
    });
});

test('loadLintConfig: reads lint.config.ts of the root only, {} when there is none', async () => {
    await inTempDir({ 'lint.config.ts': 'export default { nx: false };\n' }, async (dir) => {
        assert.deepEqual(await loadLintConfig(dir), { nx: false });
    });
    await inTempDir({ 'packages/a/lint.config.ts': 'export default { nx: false };\n' }, async (dir) => {
        assert.deepEqual(await loadLintConfig(dir), {});
    });
});

test('resolveLintConfig: defaults, then lint.config.ts, then the overrides', async () => {
    await inTempDir(
        { 'lint.config.ts': "export default { skills: { 'vercel-labs/agent-skills': false }, nx: false };\n" },
        async (dir) => {
            const config = await resolveLintConfig({ nx: true }, dir);
            assert.equal(config.nx, true);
            assert.deepEqual(config.skills?.['@kirill.konshin/lint'], true);
            assert.deepEqual(config.skills?.['vercel-labs/agent-skills'], {
                ...(DEFAULT_LINT_CONFIG.skills?.['vercel-labs/agent-skills'] as object),
                enabled: false,
            });
        },
    );
});

test('the config entry loads no ESLint plugin', () => {
    assert.deepEqual(
        packagesLoadedBy('config.js').filter((url) => /eslint-(plugin|config)-/.test(url)),
        [],
    );
});
