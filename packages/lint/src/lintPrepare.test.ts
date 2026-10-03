import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, vi } from 'vitest';

import { checkRulesDirSafety, generateAgentsFile, readRules, symlinkRules } from './lintPrepare.js';
import { inTempDir } from './testUtils.js';

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const AUTH_RULE = { file: 'auth.md', name: 'auth', content: '' };

test('readRules: every shipped rule has a frontmatter description', () => {
    for (const rule of readRules()) {
        assert.ok(rule.description, `${rule.file} has no description`);
    }
});

test('generateAgentsFile: a titled block per rule with its description and cwd-relative path', () => {
    const content = generateAgentsFile(
        [
            { file: 'monorepo-turbo-nx.md', name: 'monorepo-turbo-nx', description: 'Monorepo rules', content: '' },
            { file: 'i18n.md', name: 'i18n', content: '' },
        ],
        PACKAGE_DIR,
        null,
    );

    const expected = [
        '# Rules',
        '## Monorepo turbo nx',
        'Monorepo rules',
        'See instructions in @rules/monorepo-turbo-nx.md [rules/monorepo-turbo-nx.md](rules/monorepo-turbo-nx.md).',
        '## I18n',
        'See instructions in @rules/i18n.md [rules/i18n.md](rules/i18n.md).',
        '---',
    ].join('\n\n');

    assert.ok(content.includes(expected), content);
});

test('symlinked cwd: rule symlinks and AGENTS.md paths resolve to the real rule files', async () => {
    await inTempDir({ 'real/nested/project/.keep': '' }, async (dir) => {
        // the link sits at a different depth than its target, paths computed lexically from it would dangle
        const cwd = join(dir, 'link');
        symlinkSync(join(dir, 'real/nested/project'), cwd);
        const source = readFileSync(join(PACKAGE_DIR, 'rules/auth.md'), 'utf8');

        symlinkRules(cwd, [AUTH_RULE]);
        const match = /See instructions in @(\S+) /.exec(generateAgentsFile([AUTH_RULE], cwd, null));

        assert.ok(match);
        assert.equal(readFileSync(resolve(realpathSync(cwd), match[1]), 'utf8'), source);
        assert.equal(readFileSync(join(cwd, '.claude/rules/auth.md'), 'utf8'), source);
        assert.equal(readFileSync(join(cwd, '.codex/rules/auth.md'), 'utf8'), source);
    });
});

test('symlinkRules: replaces stale links and keeps Codex command policies', async () => {
    await inTempDir({ '.codex/rules/default.rules': '' }, async (dir) => {
        mkdirSync(join(dir, '.claude/rules'), { recursive: true });
        symlinkSync('gone.md', join(dir, '.claude/rules/gone.md'));
        checkRulesDirSafety(join(dir, '.claude/rules'));
        checkRulesDirSafety(join(dir, '.codex/rules'));

        symlinkRules(dir, [AUTH_RULE]);

        assert.deepEqual(readdirSync(join(dir, '.claude/rules')), ['auth.md']);
        assert.deepEqual(readdirSync(join(dir, '.codex/rules')).sort(), ['auth.md', 'default.rules']);
    });
});

test('checkRulesDirSafety: refuses to clear a hand-written rule', async () => {
    await inTempDir({ '.codex/rules/mine.md': '' }, async (dir) => {
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('exit');
        });
        vi.spyOn(console, 'error').mockImplementation(() => {});

        try {
            assert.throws(() => checkRulesDirSafety(join(dir, '.codex/rules')), /exit/);
            assert.deepEqual(exit.mock.calls, [[1]]);
        } finally {
            vi.restoreAllMocks();
        }
    });
});
