import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'vitest';

import { asOptions, findWorkspaceRoot, toolGate } from './lib.js';
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
                // the nested package HAS its own package.json - the workspace-manifest walk
                // (@manypkg/find-root) must not stop there
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
        // re-resolved via the nearest-package.json fallback (fresh cwd - the result is cached per cwd)
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

// ----- toolGate: the shared activation gate of the tool-scoped config blocks -----

const SPEC = { tool: 'demo', has: false };
const NEEDS = { what: 'entry file', detail: 'single demo entry file', hint: '`demo: { path }`' };
const absolutizePath = ({ path }) => (path ? [path] : []);

test('toolGate: false and enabled: false are always off, keeping the other options', () => {
    assert.deepEqual(toolGate(false, false, { ...SPEC, has: true }), { enabled: false, options: {}, files: [] });
    assert.deepEqual(toolGate({ enabled: false, path: 'x' }, true, { ...SPEC, has: true }), {
        enabled: false,
        options: { path: 'x' },
        files: [],
    });
});

test('toolGate: detection follows the package probe when there is no evidence scan', () => {
    assert.equal(toolGate(undefined, false, { ...SPEC, has: true }).enabled, true);
    assert.equal(toolGate(undefined, false, SPEC).enabled, false);
    // forced on wins over a negative probe
    assert.equal(toolGate(true, false, SPEC).enabled, true);
});

test('toolGate: evidence turns detection on; absolutizeOptions evidence wins over the scan', () => {
    const scanned = toolGate(undefined, false, { ...SPEC, scan: () => ['/x/found'] });
    assert.deepEqual(scanned, { enabled: true, options: {}, files: ['/x/found'] });

    const supplied = toolGate({ path: '/x/mine' }, false, {
        ...SPEC,
        absolutizeOptions: absolutizePath,
        scan: () => assert.fail('scan must not run when the options supplied evidence'),
    });
    assert.deepEqual(supplied, { enabled: true, options: { path: '/x/mine' }, files: ['/x/mine'] });
});

test('toolGate: allowMultiple: false makes several candidates a hard error, even in auto mode', () => {
    const spec = { ...SPEC, allowMultiple: false, scan: () => ['/x/a', '/x/b'] };
    // a silent skip of a tool that is evidently present would be hard to detect - always throw
    assert.throws(() => toolGate(undefined, false, spec), /several evidence candidates/);
    assert.throws(() => toolGate(true, false, { ...spec, needs: NEEDS }), /several entry file candidates/);
    // `enabled: false` never scans, so it stays the escape hatch
    assert.equal(toolGate(false, false, spec).enabled, false);
    // exactly one candidate is fine
    assert.deepEqual(toolGate(undefined, false, { ...spec, scan: () => ['/x/a'] }).files, ['/x/a']);
});

test('toolGate: leaf-only install is a hard error pointing at the leaf - hoisting, not bridging, is the fix', async () => {
    await inTempDir(
        {
            'packages/web/demo.config.js': '',
            'packages/web/node_modules/gatepkg/package.json': '{"name":"gatepkg","version":"1.0.0","main":"i.js"}',
            'packages/web/node_modules/gatepkg/i.js': '',
        },
        async () => {
            const scan = () => [join(process.cwd(), 'packages/web/demo.config.js')];
            assert.throws(
                () => toolGate(undefined, false, { ...SPEC, packageName: 'gatepkg', scan }),
                /not resolvable from the workspace root \(it is installed near/,
            );
        },
    );
});

test('toolGate: evidence with an unresolvable package always fails loudly unless the plugin can cope', async () => {
    await inTempDir({ 'demo.config.js': '' }, async () => {
        const spec = { ...SPEC, packageName: 'gatemissingpkg', scan: () => [join(process.cwd(), 'demo.config.js')] };
        // auto-detected AND forced: the evidence proves the tool is in use - a silent skip would
        // hide a broken setup, so both throw with hoisting guidance
        assert.throws(() => toolGate(undefined, false, spec), /hoist it/);
        assert.throws(() => toolGate(true, false, spec), /hoist it/);
        // jest/vitest: the rules work without the runner installed
        assert.equal(toolGate(true, false, { ...spec, requirePackage: false }).enabled, true);
    });
});

test('toolGate: mandatory evidence (needs) - inert when auto-detected, loud when forced', () => {
    // a positive probe alone is not enough when the plugin cannot run without the evidence
    assert.equal(toolGate(undefined, false, { ...SPEC, has: true, needs: NEEDS }).enabled, false);
    assert.throws(() => toolGate(true, false, { ...SPEC, needs: NEEDS }), /no single demo entry file/);
});

test('toolGate: strict gates on the same-scope probe and never scans', () => {
    const scan = () => assert.fail('strict must not scan');
    assert.equal(toolGate(undefined, true, { ...SPEC, has: true, scan }).enabled, true);
    assert.equal(toolGate(undefined, true, { ...SPEC, scan }).enabled, false);
    // strictHas overrides the probe (nx: `nx.json` at cwd instead of the workspace root)
    assert.equal(toolGate(undefined, true, { ...SPEC, strictHas: true, scan }).enabled, true);
});

test('toolGate: strict throws when a tool that is on cannot work', () => {
    assert.throws(() => toolGate(true, true, { ...SPEC, packageName: 'gatemissingpkg' }), /strict detection/);
    assert.throws(() => toolGate(true, true, { ...SPEC, needs: NEEDS }), /strict detection/);
    // options-supplied evidence satisfies `needs` under strict
    const gate = toolGate({ path: '/x/mine' }, true, { ...SPEC, needs: NEEDS, absolutizeOptions: absolutizePath });
    assert.deepEqual(gate, { enabled: true, options: { path: '/x/mine' }, files: ['/x/mine'] });
});
