import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, test, vi } from 'vite-plus/test';

import {
    finishGraphify,
    graphifyAgentsSection,
    graphifyMode,
    removeGraphifySkills,
    removeSection,
    setUpGraphify,
    toVenvCommand,
    updateClaudeSettings,
    updateGitignoreBlock,
    updateGraphifyHooks,
    venvExe,
} from './graphify.js';
import { generateAgentsFile, type RunCommand } from './lintPrepare.js';
import { inTempDir } from './testUtils.js';

const SECTION = '## graphify\n\nThis project has a knowledge graph at graphify-out/.';
const VENV_EXE = '"$CLAUDE_PROJECT_DIR"/.venv/bin/graphify';
const hook = (command: string) => ({ type: 'command', command, timeout: 10 });
const graphifyHooks = (exe: string) => ({
    PreToolUse: [
        { matcher: 'Bash|Grep', hooks: [hook(`${exe} hook-guard search`)] },
        { matcher: 'Read|Glob', hooks: [hook(`${exe} hook-guard read`)] },
    ],
});

const write = (file: string, content: string) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
};
const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf-8'));

/**
 * A stand-in graphify, as 0.9 behaves: `install --project --platform <p>` writes that flavor's stamped skill (the
 * Claude one also its registration), `claude install` replaces its section of CLAUDE.md up to the next `## ` line and
 * writes its hooks with this machine's executable.
 */
const fakeGraphify = vi.fn<RunCommand>((command, args, { cwd }) => {
    const dir = String(cwd);

    if (args[0] === 'install') {
        const agentDir = args.at(-1) === 'claude' ? '.claude' : '.agents';
        write(join(dir, agentDir, 'skills', 'graphify', 'SKILL.md'), args.at(-1)!);
        write(join(dir, agentDir, 'skills', 'graphify', '.graphify_version'), '0.9');
        if (agentDir === '.claude') write(join(dir, '.claude', 'CLAUDE.md'), '# graphify\n- **graphify** skill\n');
    }
    if (args[0] === 'claude') {
        const file = join(dir, 'CLAUDE.md');
        const lines = readFileSync(file, 'utf-8').split('\n');
        const start = lines.indexOf('## graphify');
        const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
        writeFileSync(file, [...lines.slice(0, start), SECTION, '', ...lines.slice(end)].join('\n'));
        write(join(dir, '.claude', 'settings.json'), JSON.stringify({ hooks: graphifyHooks(command) }));
    }
    return { status: 0 };
});

/** A `PATH` directory holding executable stand-ins for `names`. */
const fakeBin = (dir: string, ...names: string[]): string => {
    const bin = join(dir, 'bin');
    for (const name of names) {
        write(join(bin, name), '#!/bin/sh\n');
        chmodSync(join(bin, name), 0o755);
    }
    return bin;
};

afterEach(() => {
    vi.unstubAllEnvs();
    fakeGraphify.mockClear();
});

test('graphifyMode: left out is detected, true or options install into .venv, false is off', () => {
    assert.equal(graphifyMode(undefined).mode, 'detect');
    assert.equal(graphifyMode(true).mode, 'venv');
    assert.equal(graphifyMode(false).mode, 'off');
    assert.equal(graphifyMode({ enabled: false }).mode, 'off');
    assert.deepEqual(graphifyMode({ version: '1.2.3' }), { mode: 'venv', version: '1.2.3' });
});

test('toVenvCommand: a graphify hook command runs the .venv executable, whatever path graphify wrote', () => {
    assert.equal(toVenvCommand('graphify hook-guard read'), `${VENV_EXE} hook-guard read`);
    assert.equal(toVenvCommand('/home/me/p/.venv/bin/graphify hook-guard search'), `${VENV_EXE} hook-guard search`);
    assert.equal(toVenvCommand('"/my dir/graphify" hook-check'), `${VENV_EXE} hook-check`);
});

test('updateGraphifyHooks: points graphify hooks at .venv or drops them, other hooks stay', () => {
    const own = { matcher: 'Bash', hooks: [hook('./check.sh')] };
    const mixed = { matcher: 'Read', hooks: [hook('./read.sh'), hook('/abs/graphify hook-guard read')] };
    const settings = {
        permissions: { allow: [] },
        hooks: { ...graphifyHooks('graphify'), Stop: [own], Post: [mixed] },
    };

    assert.deepEqual(updateGraphifyHooks(settings, false), {
        permissions: { allow: [] },
        hooks: { Stop: [own], Post: [{ matcher: 'Read', hooks: [hook('./read.sh')] }] },
    });
    assert.deepEqual(updateGraphifyHooks(settings, true).hooks, {
        ...graphifyHooks(VENV_EXE),
        Stop: [own],
        Post: [{ matcher: 'Read', hooks: [hook('./read.sh'), hook(`${VENV_EXE} hook-guard read`)] }],
    });
    assert.deepEqual(updateGraphifyHooks({ hooks: graphifyHooks('graphify') }, false), {});
});

test('updateClaudeSettings: no file, no file; a file that does not parse is left alone', async () => {
    await inTempDir({}, async (dir) => {
        const file = join(dir, '.claude', 'settings.json');

        updateClaudeSettings(dir, true);
        assert.ok(!existsSync(file));

        write(file, '{ broken');
        updateClaudeSettings(dir, false);
        assert.equal(readFileSync(file, 'utf-8'), '{ broken');
    });
});

test('updateGitignoreBlock: adds, replaces and removes its own block, the rest of the file stays', () => {
    const added = updateGitignoreBlock('node_modules\n', ['/graphify-out']);
    assert.equal(
        added,
        'node_modules\n\n# @kirill.konshin/lint: graphify\n/graphify-out\n# @kirill.konshin/lint: graphify end\n',
    );
    assert.equal(updateGitignoreBlock(added, ['/graphify-out']), added);
    assert.ok(updateGitignoreBlock(added, ['/graphify-out', '/.venv']).includes('/graphify-out\n/.venv\n# '));
    assert.equal(updateGitignoreBlock(added, []), 'node_modules\n');
    assert.equal(updateGitignoreBlock('', []), '');
});

test('removeSection: from the exact heading up to the next boundary line or the end', () => {
    assert.equal(removeSection('# a\n\n# graphify\n- x\n\n# b\n', '# graphify', '# '), '# a\n\n# b\n');
    assert.equal(removeSection('# a\n\n# graphify\n- x\n', '# graphify', '# '), '# a\n');
    assert.equal(removeSection('# graphify tools\n', '# graphify', '# '), '# graphify tools\n');
});

test('graphifyAgentsSection: an empty anchor, then the kept section; the virtualenv heading always ends it', () => {
    const empty = graphifyAgentsSection();
    assert.ok(empty.startsWith('## graphify\n\n## graphify virtualenv\n'), empty);
    assert.ok(empty.includes('source .venv/bin/activate &&'), empty);

    const previous = generateAgentsFile([], '# Mine', '', graphifyAgentsSection()).replace(
        '## graphify\n',
        `${SECTION}\n`,
    );
    assert.ok(graphifyAgentsSection(previous).startsWith(`${SECTION}\n\n## graphify virtualenv`));
});

test('generateAgentsFile: the graphify section follows the tool sections, above the custom section', () => {
    const content = generateAgentsFile([], '# Mine\n\n## Kept', '', graphifyAgentsSection());

    assert.ok(content.indexOf('<!--VITE PLUS END-->') < content.indexOf('## graphify\n'), content);
    assert.ok(content.indexOf('## graphify virtualenv') < content.indexOf('# Custom Rules'), content);
    assert.ok(content.trimEnd().endsWith('## Kept'), content);
});

test('setUpGraphify: CI and a detect without graphify on PATH run nothing; graphify: true needs uv', async () => {
    await inTempDir({}, async (dir) => {
        vi.stubEnv('CI', '');
        vi.stubEnv('PATH', join(dir, 'empty'));
        assert.deepEqual(setUpGraphify(dir, undefined, fakeGraphify), { mode: 'detect' });
        assert.throws(() => setUpGraphify(dir, true, fakeGraphify), /needs uv/);

        vi.stubEnv('CI', 'true');
        assert.deepEqual(setUpGraphify(dir, true, fakeGraphify), { mode: 'venv' });
        assert.equal(fakeGraphify.mock.calls.length, 0);
    });
});

test('graphify: true end to end - .venv, both skill flavors in place, the section in AGENTS.md, hooks on .venv', async () => {
    await inTempDir({}, async (dir) => {
        vi.stubEnv('CI', '');
        vi.stubEnv('PATH', fakeBin(dir, 'uv'));
        write(join(dir, 'CLAUDE.md'), generateAgentsFile([], '# Mine', '', graphifyAgentsSection()));

        const setup = setUpGraphify(dir, { version: '1.2.3' }, fakeGraphify);
        finishGraphify(dir, setup, fakeGraphify);

        const uv = join(dir, 'bin', 'uv');
        assert.deepEqual(
            fakeGraphify.mock.calls.map(([command, args]) => [command, ...args].join(' ')),
            [
                `${uv} venv --allow-existing .venv`,
                `${uv} pip install --python .venv graphifyy==1.2.3`,
                `${venvExe(dir)} install --project --platform agents`,
                `${venvExe(dir)} install --project --platform claude`,
                `${venvExe(dir)} claude install`,
                `${venvExe(dir)} update .`,
            ],
        );
        assert.equal(readFileSync(join(dir, '.agents/skills/graphify/SKILL.md'), 'utf-8'), 'agents');
        assert.equal(readFileSync(join(dir, '.claude/skills/graphify/SKILL.md'), 'utf-8'), 'claude');

        const agents = readFileSync(join(dir, 'CLAUDE.md'), 'utf-8');
        assert.ok(agents.includes(`${SECTION}\n\n## graphify virtualenv`), agents);
        assert.ok(agents.trimEnd().endsWith('# Mine'), agents);
        assert.deepEqual(readJson(join(dir, '.claude/settings.json')), { hooks: graphifyHooks(VENV_EXE) });
    });
});

test('graphify detected: skills and the graph, no section or hooks; a stale graphify hook is dropped', async () => {
    await inTempDir({}, async (dir) => {
        vi.stubEnv('CI', '');
        vi.stubEnv('PATH', fakeBin(dir, 'graphify'));
        write(join(dir, '.claude/settings.json'), JSON.stringify({ hooks: graphifyHooks(VENV_EXE) }));

        const setup = setUpGraphify(dir, undefined, fakeGraphify);
        finishGraphify(dir, setup, fakeGraphify);

        assert.equal(setup.exe, join(dir, 'bin', 'graphify'));
        assert.ok(existsSync(join(dir, '.agents/skills/graphify/SKILL.md')));
        assert.ok(!fakeGraphify.mock.calls.some(([, args]) => args[0] === 'claude'));
        assert.deepEqual(fakeGraphify.mock.lastCall![1], ['update', '.']);
        assert.deepEqual(readJson(join(dir, '.claude/settings.json')), {});
    });
});

test('graphify: false removes the stamped skills and the registration, never a skill folder of the user', async () => {
    await inTempDir(
        {
            '.agents/skills/graphify/SKILL.md': 'mine',
            '.claude/skills/graphify/SKILL.md': 'graphify',
            '.claude/skills/graphify/.graphify_version': '0.9',
            '.claude/CLAUDE.md': '# Mine\n\n# graphify\n- **graphify** skill\n',
        },
        async (dir) => {
            vi.stubEnv('CI', '');
            setUpGraphify(dir, false, fakeGraphify);

            assert.ok(existsSync(join(dir, '.agents/skills/graphify/SKILL.md')));
            assert.ok(!existsSync(join(dir, '.claude/skills/graphify')));
            assert.equal(readFileSync(join(dir, '.claude/CLAUDE.md'), 'utf-8'), '# Mine\n');

            write(join(dir, '.claude/CLAUDE.md'), '# graphify\n- **graphify** skill\n');
            removeGraphifySkills(dir);
            assert.ok(!existsSync(join(dir, '.claude/CLAUDE.md')));
        },
    );
});
