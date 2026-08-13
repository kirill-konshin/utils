import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'vitest';

const require = createRequire(import.meta.url);
const { defineYarnConfig } = require('@kirill.konshin/lint/yarn');

function makeWorkspace(cwd, manifest = {}) {
    return {
        cwd,
        manifest,
        errors: [],
        error(message) {
            this.errors.push(message);
        },
    };
}

function makeDependency(workspace, ident, range, type = 'devDependencies') {
    return {
        workspace,
        ident,
        range,
        type,
        updates: [],
        update(nextRange) {
            this.updates.push(nextRange);
        },
    };
}

function makeContext(root, dependencies) {
    return {
        Yarn: {
            workspace(filter) {
                return filter?.cwd === '.' ? root : null;
            },
            dependencies(filter = {}) {
                return dependencies.filter(
                    (dependency) =>
                        (filter.ident === undefined || dependency.ident === filter.ident) &&
                        (filter.workspace === undefined || dependency.workspace === filter.workspace),
                );
            },
        },
    };
}

test('defineYarnConfig is available from the dedicated Yarn entry point', () => {
    assert.equal(typeof defineYarnConfig, 'function');
    assert.equal(typeof defineYarnConfig().constraints, 'function');
});

test('overrides and resolutions set canonical ranges on non-peer leaf dependencies', async () => {
    const root = makeWorkspace('.', {
        devDependencies: { typescript: '^6.0.3' },
        overrides: { typescript: '$typescript' },
        resolutions: { typescript: '^6', '**/@nx/js': '23.2.0-beta.7' },
    });
    const leaf = makeWorkspace('packages/leaf');
    const typescript = makeDependency(leaf, 'typescript', '*');
    const typescriptPeer = makeDependency(leaf, 'typescript', '^6', 'peerDependencies');
    const nx = makeDependency(leaf, '@nx/js', '^23');
    const rootTypescript = makeDependency(root, 'typescript', '^6.0.3');

    await defineYarnConfig().constraints(makeContext(root, [typescript, typescriptPeer, nx, rootTypescript]));

    assert.deepEqual(typescript.updates, ['^6.0.3']);
    assert.deepEqual(typescriptPeer.updates, []);
    assert.deepEqual(nx.updates, ['23.2.0-beta.7']);
    assert.deepEqual(rootTypescript.updates, []);
});

test('without overrides the default packages use the root or first deterministic leaf range', async () => {
    const root = makeWorkspace('.');
    const a = makeWorkspace('packages/a');
    const b = makeWorkspace('packages/b');
    const rootEslint = makeDependency(root, 'eslint', '^10.8.1');
    const leafEslint = makeDependency(a, 'eslint', '^10');
    const bNext = makeDependency(b, 'next', '^16.3.0');
    const aNext = makeDependency(a, 'next', '^16');

    await defineYarnConfig().constraints(makeContext(root, [rootEslint, leafEslint, bNext, aNext]));

    assert.deepEqual(leafEslint.updates, ['^10.8.1']);
    assert.deepEqual(aNext.updates, ['^16']);
    assert.deepEqual(bNext.updates, ['^16']);
});

test('invalid override references report a constraint error', async () => {
    const root = makeWorkspace('.', { overrides: { typescript: '$typescript' } });

    await defineYarnConfig().constraints(makeContext(root, []));

    assert.deepEqual(root.errors, ['Override $typescript must reference a root dependency']);
});
