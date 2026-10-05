import assert from 'node:assert/strict';
import {
    lstatSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    readlinkSync,
    realpathSync,
    renameSync,
    symlinkSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';

import {
    generateAgentsFile,
    installedRules,
    packageFiles,
    readRules,
    readSkills,
    readUserFiles,
    syncAgentDirs,
} from './lintPrepare.js';
import { inTempDir } from './testUtils.js';

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const AGENT_DIRS = ['.agents', '.claude', '.codex'];
const MIRROR_DIRS = ['.claude', '.codex'];
const AUTH_RULE = { file: 'auth.md', name: 'auth', content: '' };
const LINT_REPO_SKILL = { name: 'lint-repo' };

/**
 * Where `link` points, one hop only - a chained link would resolve to another link, not to the file itself.
 */
const linkTarget = (link: string): string => resolve(realpathSync(dirname(link)), readlinkSync(link));

/**
 * Run the sync the way `lint-prepare` does, with one package rule and skill.
 */
const sync = (cwd: string, files = packageFiles([AUTH_RULE], [LINT_REPO_SKILL])): void =>
    syncAgentDirs(cwd, files, readUserFiles(cwd));

const list = (dir: string): string[] => readdirSync(dir).sort();

test('readRules: every shipped rule has a frontmatter description', () => {
    for (const rule of readRules()) {
        assert.ok(rule.description, `${rule.file} has no description`);
    }
});

test('generateAgentsFile: a titled block per rule with its description and canonical .agents path', () => {
    const content = generateAgentsFile(
        [
            { file: 'monorepo-turbo-nx.md', name: 'monorepo-turbo-nx', description: 'Monorepo rules', content: '' },
            { file: 'i18n.md', name: 'i18n', content: '' },
        ],
        null,
    );

    const expected = [
        '# Rules',
        '## Monorepo turbo nx',
        'Monorepo rules',
        'See instructions in @.agents/rules/monorepo-turbo-nx.md [.agents/rules/monorepo-turbo-nx.md](.agents/rules/monorepo-turbo-nx.md).',
        '## I18n',
        'See instructions in @.agents/rules/i18n.md [.agents/rules/i18n.md](.agents/rules/i18n.md).',
        '---',
    ].join('\n\n');

    assert.ok(content.includes(expected), content);
});

test('syncAgentDirs: creates every agent dir and links package files straight to the package, from a symlinked cwd too', async () => {
    await inTempDir({ 'real/nested/project/.keep': '' }, async (dir) => {
        // the link sits at a different depth than its target, paths computed lexically from it would dangle
        const cwd = join(dir, 'link');
        symlinkSync(join(dir, 'real/nested/project'), cwd);

        sync(cwd);

        for (const agentDir of AGENT_DIRS) {
            for (const kind of ['rules', 'commands', 'skills']) {
                assert.ok(lstatSync(join(cwd, agentDir, kind)).isDirectory());
            }

            assert.ok(lstatSync(join(cwd, agentDir, 'skills/lint-repo')).isDirectory());
            assert.equal(
                linkTarget(join(cwd, agentDir, 'rules/auth.md')),
                realpathSync(join(PACKAGE_DIR, 'rules/auth.md')),
            );
            assert.equal(
                linkTarget(join(cwd, agentDir, 'skills/lint-repo/SKILL.md')),
                realpathSync(join(PACKAGE_DIR, 'skills/lint-repo/SKILL.md')),
            );
        }
    });
});

test('syncAgentDirs: every shipped skill arrives in every agent dir complete, with the package README next to SKILL.md', async () => {
    const skills = readSkills();
    const files = packageFiles([], skills);

    await inTempDir({ '.keep': '' }, async (cwd) => {
        sync(cwd, files);

        for (const { name } of skills) {
            const shipped = join(PACKAGE_DIR, 'skills', name);
            const shippedFiles = readdirSync(shipped, { recursive: true, withFileTypes: true })
                .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
                .map((entry) => relative(shipped, join(entry.parentPath, entry.name)));

            for (const agentDir of AGENT_DIRS) {
                const skill = join(cwd, agentDir, 'skills', name);

                for (const file of shippedFiles) {
                    assert.equal(linkTarget(join(skill, file)), realpathSync(join(shipped, file)), `${name}/${file}`);
                    assert.ok(!lstatSync(dirname(join(skill, file))).isSymbolicLink(), `${name}/${file} dir`);
                }

                assert.ok(lstatSync(join(skill, 'README.md')).isSymbolicLink(), `${name}/README.md`);
            }
        }
    });
});

test("syncAgentDirs: mirrors the user's own .agents files, which win over the package ones", async () => {
    const own = [
        'rules/auth.md',
        'rules/local.md',
        'commands/deploy.md',
        'skills/own/SKILL.md',
        'skills/own/bin/run.sh',
    ];

    await inTempDir(Object.fromEntries(own.map((file) => [`.agents/${file}`, file])), async (cwd) => {
        sync(cwd);

        assert.equal(readFileSync(join(cwd, '.agents/rules/auth.md'), 'utf8'), 'rules/auth.md');

        for (const mirror of MIRROR_DIRS) {
            for (const file of own) {
                assert.equal(linkTarget(join(cwd, mirror, file)), join(realpathSync(cwd), '.agents', file));
            }
        }
    });
});

test("syncAgentDirs: removes dead links and links it no longer places, keeps the user's files and links", async () => {
    await inTempDir(
        { '.agents/rules/old.md': '', '.claude/rules/own.md': '', '.codex/rules/default.rules': '' },
        async (cwd) => {
            sync(cwd);

            renameSync(join(cwd, '.agents/rules/old.md'), join(cwd, '.agents/rules/new.md'));
            symlinkSync('missing.md', join(cwd, '.codex/rules/dead.md'));
            mkdirSync(join(cwd, '.claude/skills/gone'));
            symlinkSync('missing.md', join(cwd, '.claude/skills/gone/SKILL.md'));
            symlinkSync(join(cwd, '.agents/rules/new.md'), join(cwd, '.claude/rules/alias.md'));

            // the package dropped its rule and skill - the valid README.md link must go with them
            sync(cwd, packageFiles([], []));

            assert.deepEqual(list(join(cwd, '.agents/rules')), ['new.md']);
            assert.deepEqual(list(join(cwd, '.claude/rules')), ['.gitignore', 'alias.md', 'new.md', 'own.md']);
            assert.deepEqual(list(join(cwd, '.codex/rules')), ['.gitignore', 'default.rules', 'new.md']);
            assert.deepEqual(list(join(cwd, '.claude/skills')), []);
        },
    );
});

test('syncAgentDirs: never writes over a real file or through a linked directory', async () => {
    await inTempDir({ '.claude/rules/auth.md': 'mine', 'shared/.keep': '' }, async (cwd) => {
        mkdirSync(join(cwd, '.codex'));
        symlinkSync(join(cwd, 'shared'), join(cwd, '.codex/skills'));

        sync(cwd);

        assert.equal(readFileSync(join(cwd, '.claude/rules/auth.md'), 'utf8'), 'mine');
        assert.deepEqual(list(join(cwd, 'shared')), ['.keep']);
    });
});

test('syncAgentDirs: .gitignore lists only the links, a .gitignore of the user is left alone', async () => {
    await inTempDir(
        { '.agents/rules/local.md': '', '.agents/commands/deploy.md': '', '.claude/commands/.gitignore': 'mine\n' },
        async (cwd) => {
            sync(cwd);

            const entries = (file: string): string[] =>
                readFileSync(join(cwd, file, '.gitignore'), 'utf8')
                    .split('\n')
                    .slice(1);

            assert.deepEqual(entries('.agents/rules'), ['/.gitignore', '/auth.md', '']);
            assert.deepEqual(entries('.claude/rules'), ['/.gitignore', '/auth.md', '/local.md', '']);
            assert.deepEqual(entries('.agents/skills'), [
                '/.gitignore',
                '/lint-repo/README.md',
                '/lint-repo/SKILL.md',
                '',
            ]);
            assert.equal(readFileSync(join(cwd, '.claude/commands/.gitignore'), 'utf8'), 'mine\n');
        },
    );
});

test("installedRules: the user's .agents rules join the package ones, winning on the same file", async () => {
    await inTempDir(
        { '.agents/rules/auth.md': '---\ndescription: Mine\n---\n', '.agents/rules/team/zeta.md': '' },
        async (cwd) => {
            const packageRules = [
                { ...AUTH_RULE, description: 'Package' },
                { file: 'i18n.md', name: 'i18n', content: '' },
            ];

            assert.deepEqual(
                installedRules(packageRules, readUserFiles(cwd)).map(({ file, name, description }) => [
                    file,
                    name,
                    description,
                ]),
                [
                    ['auth.md', 'auth', 'Mine'],
                    ['i18n.md', 'i18n', undefined],
                    ['team/zeta.md', 'zeta', undefined],
                ],
            );
        },
    );
});
