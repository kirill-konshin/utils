import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'vitest';

import { asOptions, findWorkspaceRoot } from './lib.js';
import { inTempDir } from './testUtils.js';

test('asOptions: booleans normalize to { enabled }', () => {
    assert.deepEqual(asOptions(true), { enabled: true });
    assert.deepEqual(asOptions(false), { enabled: false });
});

test('asOptions: undefined stays undecided so callers fall back to detection', () => {
    assert.deepEqual(asOptions(undefined), {});
    assert.deepEqual(asOptions(null), {});
});

test('asOptions: an options object implies enabled: true unless it says otherwise', () => {
    assert.deepEqual(asOptions({}), { enabled: true });
    assert.deepEqual(asOptions({ cssConfigPath: 'a.css' }), { enabled: true, cssConfigPath: 'a.css' });
    assert.deepEqual(asOptions({ enabled: false, cssConfigPath: 'a.css' }), {
        enabled: false,
        cssConfigPath: 'a.css',
    });
});

test('findWorkspaceRoot: trusts package-manager env when it contains cwd', async () => {
    await inTempDir({}, async () => {
        // inTempDir points PROJECT_CWD (the cheapest accepted source) at the temp dir
        assert.equal(findWorkspaceRoot(process.cwd()), process.cwd());
    });
});

test('findWorkspaceRoot: resolves a Yarn 1 style workspace (package.json workspaces + yarn.lock) from inside a package', async () => {
    await inTempDir(
        {
            'package.json': '{"private":true,"workspaces":["packages/*"]}',
            'yarn.lock': '',
            'packages/a/package.json': '{"name":"a"}',
        },
        async () => {
            const root = process.cwd();
            // Yarn 1 sets no root env - simulate a process with nothing usable (restored by inTempDir)
            process.env.PROJECT_CWD = '/somewhere/else';
            const previousNpmPrefix = process.env.npm_config_local_prefix;
            delete process.env.npm_config_local_prefix;
            try {
                // the nested package HAS its own package.json - `npm prefix` must not stop there
                assert.equal(findWorkspaceRoot(join(root, 'packages/a')), root);
            } finally {
                if (previousNpmPrefix !== undefined) process.env.npm_config_local_prefix = previousNpmPrefix;
            }
        },
    );
});

test('findWorkspaceRoot: rejects env that does not contain cwd and resolves the root from inside a package', async () => {
    await inTempDir({ 'package.json': '{}', 'yarn.lock': '', 'packages/x/deep/note.txt': '' }, async () => {
        const root = process.cwd();
        // PROJECT_CWD points at the temp ROOT - valid because it contains this nested cwd
        assert.equal(findWorkspaceRoot(join(root, 'packages/x')), root);

        // stale env from an unrelated checkout must be rejected (containment check), and the root
        // re-resolved via the CLI probes / lockfile walk (fresh cwd - the result is cached per cwd)
        process.env.PROJECT_CWD = '/somewhere/else';
        const previousNpmPrefix = process.env.npm_config_local_prefix;
        delete process.env.npm_config_local_prefix;
        try {
            assert.equal(findWorkspaceRoot(join(root, 'packages/x/deep')), root);
        } finally {
            if (previousNpmPrefix !== undefined) process.env.npm_config_local_prefix = previousNpmPrefix;
        }
    });
});
