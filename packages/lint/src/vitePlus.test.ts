import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';
import { test } from 'vite-plus/test';

import { eslintExts } from './exts.js';
import { prettier } from './prettier.js';
import { inTempDir, packagesLoadedBy, TAILWIND_ENTRY } from './testUtils.js';
import { fmtConfig, lintConfig, stagedConfig, vitePlusConfig } from './vitePlus.js';

const OFF = { detection: false } as const;

test('the ./vite-plus entry loads no ESLint plugin - every vp command loads vite.config.ts', () => {
    const plugins = packagesLoadedBy('vitePlus.js').filter((url) => /eslint-(plugin|config)|@nx\/|vite-plus/.test(url));
    assert.deepEqual(plugins, []);
});

test('the ./oxlint-plugin entry loads no dependency - Oxlint loads it for every lint run', () => {
    assert.deepEqual(packagesLoadedBy('oxlintPlugin.js'), []);
});

test('fmt keeps the Prettier defaults', () => {
    const fmt = fmtConfig();
    for (const key of ['printWidth', 'tabWidth', 'singleQuote', 'proseWrap'] as const) {
        assert.equal(fmt[key], prettier[key], key);
    }
    assert.deepEqual(fmt.overrides?.[0], { files: [`**/${eslintExts}`], options: { tabWidth: 4 } });
});

test('fmt ignores what the recommended .prettierignore did, and files their tools regenerate', () => {
    assert.deepEqual(fmtConfig().ignorePatterns, [
        '.idea',
        '.husky',
        '.yarn',
        '/AGENTS.md',
        '**/next-env.d.ts',
        '.agents/skills/openspec-*',
        '.claude/skills/openspec-*',
        '.claude/commands/opsx',
    ]);
});

test('fmt sorts server-only / client-only guards first and keeps value style imports with their source', () => {
    const { customGroups = [], groups = [] } = fmtConfig().sortImports as {
        customGroups?: { groupName?: string; elementNamePattern?: string[] }[];
        groups?: unknown[];
    };
    assert.equal(groups[0], 'polyfill');
    const polyfill = customGroups.find((group) => group.groupName === 'polyfill');
    assert.ok(polyfill?.elementNamePattern?.includes('server-only'));
    assert.ok(!groups.flat().includes('style'));
});

test('fmt leaves imports in Markdown code blocks alone and aligns tables up to 200 columns', () => {
    const markdown = fmtConfig().overrides?.find((o) => o.files.includes('**/*.{md,mdx}'));
    assert.deepEqual(markdown?.options, { sortImports: false, printWidth: 200 });
});

test('fmt overrides .editorconfig where Prettier ignored it, and leaves package.json key order alone', () => {
    const fmt = fmtConfig();
    assert.equal(fmt.insertFinalNewline, true);
    assert.equal(fmt.sortPackageJson, false);
});

test('staged runs one vp check --fix - two tasks on one file would race', () => {
    assert.deepEqual(Object.values(stagedConfig()), ['vp check --fix']);
});

test('JS plugins are referenced by absolute path - they load from this package, whatever the hoisting', () => {
    const { jsPlugins, overrides } = lintConfig({ detection: true, storybook: true, nx: true });
    const entries = [...(jsPlugins ?? []), ...(overrides ?? []).flatMap((override) => override.jsPlugins ?? [])];
    assert.ok(entries.length > 1);
    for (const entry of entries) {
        assert.equal(typeof entry, 'object');
        assert.ok(typeof entry === 'object' && isAbsolute(entry.specifier), JSON.stringify(entry));
    }
});

test('the local plugin is always registered and its rule runs on test files', () => {
    const { jsPlugins, overrides } = lintConfig(OFF);
    assert.ok(jsPlugins?.some((entry) => typeof entry === 'object' && entry.name === 'local'));
    const tests = overrides?.find((override) => override.rules?.['local/test-colocation']);
    assert.ok(tests, 'test override expected');
});

test('with detection off only explicitly enabled tools are on', () => {
    const lint = lintConfig({ ...OFF, next: true });
    assert.ok(lint.plugins?.includes('nextjs'));
    assert.ok(!lint.jsPlugins?.some((entry) => typeof entry === 'object' && entry.name === '@nx'));
    assert.ok(!lint.overrides?.some((override) => override.rules?.['storybook/default-exports']));
    // typeAware is not a detected tool
    assert.deepEqual(lint.options, { typeAware: true, typeCheck: true });
});

test('vitest is on under detection with no probe - Vite+ bundles it', () => {
    const testOverride = (options: Parameters<typeof lintConfig>[0]) =>
        lintConfig(options).overrides?.find((override) => override.rules?.['local/test-colocation']);
    const others = { next: false, storybook: false, turbo: false, nx: false, jest: false, tailwind: false };
    assert.ok(testOverride(others)?.plugins?.includes('vitest'));
    assert.ok(!testOverride({ ...others, vitest: false })?.plugins?.includes('vitest'));
    assert.ok(!testOverride(OFF)?.plugins?.includes('vitest'));
});

test('typeAware is on by default - vp check is the type check - and typeAware: false turns it off', () => {
    assert.deepEqual(lintConfig({}).options, { typeAware: true, typeCheck: true });
    assert.equal(lintConfig({ ...OFF, typeAware: false }).options, undefined);
    assert.equal(lintConfig({ ...OFF, typeAware: false }).rules?.['typescript/prefer-nullish-coalescing'], undefined);
});

test('typeAware keeps the bug-finding type-aware rules on and the noisy ones off', () => {
    const { rules = {} } = lintConfig({ ...OFF, typeAware: true });
    for (const rule of ['no-misused-spread', 'no-base-to-string', 'unbound-method']) {
        assert.equal(rules[`typescript/${rule}` as keyof typeof rules], undefined, rule); // on via `correctness`
    }
    for (const rule of ['no-floating-promises', 'await-thenable', 'no-redundant-type-constituents']) {
        assert.equal(rules[`typescript/${rule}` as keyof typeof rules], 'off', rule);
    }
});

test('tailwind: absolute entry in settings, rules scoped to the package owning it', async () => {
    await inTempDir(
        {
            'package.json': JSON.stringify({ name: 'root', private: true, workspaces: ['packages/*'] }),
            'yarn.lock': '',
            'packages/ui/package.json': JSON.stringify({ name: 'ui' }),
            'packages/ui/src/app.css': TAILWIND_ENTRY,
        },
        async () => {
            const lint = lintConfig({ ...OFF, tailwind: true });
            const { cssConfigPath } = (lint.settings?.tailwindcss as { cssConfigPath: string } | undefined) ?? {
                cssConfigPath: '',
            };
            assert.ok(isAbsolute(cssConfigPath) && cssConfigPath.endsWith('packages/ui/src/app.css'));
            const override = lint.overrides?.find((candidate) => candidate.rules?.['tailwindcss/classnames-order']);
            assert.ok(override?.files.every((glob) => glob.startsWith('packages/ui/')));
        },
    );
});

test('next: detected app roots become settings.next.rootDir', async () => {
    await inTempDir({ 'apps/web/next.config.ts': '' }, async (dir) => {
        const lint = lintConfig({ next: true, detection: { strict: false } });
        const { rootDir } = (lint.settings?.next as { rootDir: string[] } | undefined) ?? { rootDir: [] };
        assert.ok(rootDir.some((root) => root.startsWith(dir) || root.endsWith('apps/web')));
    });
});

test('vitePlusConfig: lists add up, maps merge by key, staged is replaced', () => {
    const config = vitePlusConfig(
        {
            lint: {
                plugins: ['vue'],
                rules: { 'no-console': 'error', 'import/no-default-export': 'off' },
                overrides: [{ files: ['x/**'], rules: { 'no-console': 'off' } }],
                ignorePatterns: ['generated'],
            },
            fmt: { printWidth: 100, overrides: [{ files: ['**/*.md'], options: { proseWrap: 'always' } }] },
            staged: { '*.ts': 'vp lint' },
            test: { passWithNoTests: true },
        },
        OFF,
    );
    const base = lintConfig(OFF);

    assert.ok(config.lint?.plugins?.includes('vue') && config.lint.plugins.includes('typescript'));
    assert.equal(config.lint?.rules?.['no-console'], 'error');
    assert.equal(config.lint?.rules?.['import/no-default-export'], 'off');
    assert.ok(config.lint?.rules?.['unicorn/prefer-node-protocol'], 'base rules kept');
    assert.equal(config.lint?.overrides?.length, (base.overrides?.length ?? 0) + 1);
    assert.ok(config.lint?.ignorePatterns?.includes('generated') && config.lint.ignorePatterns.includes('**/.nx'));

    assert.equal(config.fmt?.printWidth, 100);
    assert.equal(config.fmt?.singleQuote, true);
    assert.equal(config.fmt?.overrides?.length, (fmtConfig().overrides?.length ?? 0) + 1);

    assert.deepEqual(config.staged, { '*.ts': 'vp lint' });
    assert.deepEqual(config.test, { passWithNoTests: true });
});

test('vitePlusConfig without a staged block uses the default', () => {
    assert.deepEqual(vitePlusConfig({}, OFF).staged, stagedConfig());
});
