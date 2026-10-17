import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { cleanTempDirs, SPEC, SPEC_FILE, requirement, write, repo, steward } from '../steward.fixture';
import { addGuidance, AGENTS_LINE, HOOK_COMMAND, hookFindings } from './wire';

// Every case drives git; on a loaded machine one process start can take seconds.
vi.setConfig({ testTimeout: 300_000 });

afterEach(cleanTempDirs);

describe('hook', () => {
    test('feeds back what an edit weakened, once, and ignores unrelated files', () => {
        const dir = repo({ [SPEC_FILE]: SPEC, 'README.md': '# x\n' });
        write(dir, SPEC_FILE, SPEC.replace('MUST NOT retry', 'SHOULD NOT retry'));
        const hook = (file: string) =>
            steward(dir, ['hook'], {
                input: JSON.stringify({ tool_name: 'Edit', cwd: dir, tool_input: { file_path: path.join(dir, file) } }),
            });
        const first = hook(SPEC_FILE);
        expect(JSON.parse(first.stdout)).toMatchObject({ decision: 'block' });
        expect(JSON.parse(first.stdout).reason).toContain('weakened');
        expect(hook(SPEC_FILE).stdout).toBe('');
        expect(hook('README.md').stdout).toBe('');
    });

    test('asks a new requirement for its failure and evidence, says nothing of untouched ones, runs no ratchet', () => {
        const dir = repo({ [SPEC_FILE]: SPEC });
        write(
            dir,
            SPEC_FILE,
            `${SPEC}\n### Requirement: Refunds are idempotent\n\nA refund SHALL be applied at most once per request id.\n\n#### Scenario: Repeat\n\n- **WHEN** a refund request repeats its id\n- **THEN** no second refund is made\n`,
        );
        const kinds = hookFindings(dir, SPEC_FILE).map((f) => `${f.kind} ${f.id ?? ''}`);
        expect(kinds).toContain('new-requirement demo#requirement-refunds-are-idempotent');
        expect(kinds.join()).not.toContain('payloads-stay-lean');
        expect(kinds.join()).not.toContain('scenario-unproven');
    });

    test('reports size and a duplicate anchor in the edited spec', () => {
        const dir = repo({ [SPEC_FILE]: SPEC });
        write(
            dir,
            SPEC_FILE,
            `${SPEC}${requirement('Many', 'It MUST a, MUST b, MUST c, MUST d, MUST e, MUST f, MUST g, MUST h, MUST i.', ['Lean payload'])}`,
        );
        const found = hookFindings(dir, SPEC_FILE).map((f) => `${f.severity} ${f.kind}: ${f.message.split(' — ')[0]}`);
        expect(found).toEqual(
            expect.arrayContaining([
                'error size: 9 obligations in the statement (> 8)',
                expect.stringMatching(/^error duplicate-anchor: renders #scenario-lean-payload/),
            ]),
        );
    });
});

describe('wire', () => {
    test('reports the missing points, fixes the mechanical ones, and passes once routed', () => {
        const dir = repo({
            [SPEC_FILE]: SPEC,
            'openspec/config.yaml':
                "schema: spec-driven\n\n# keep me\noperations:\n  apply:\n    guidance:\n      - 'existing'\n",
            'AGENTS.md': '# Agents\n',
        });
        expect(steward(dir, ['wire', '--check']).status).toBe(1);
        const fixed = steward(dir, ['wire', '--fix']);
        expect(fixed.stdout).toContain(
            `add to AGENTS.md, beside the specification-driven convention:\n  ${AGENTS_LINE}`,
        );
        expect(AGENTS_LINE).toMatch(
            /corpus-quality audits.*`spec-steward` skill.*code conformance is the `spec-verify` audit/,
        );
        const config = fs.readFileSync(path.join(dir, 'openspec/config.yaml'), 'utf8');
        expect(config).toContain('# keep me');
        expect(config).toContain("- 'existing'");
        expect(config.match(/spec gate \(AGENTS\.md → Checks\)/g)).toHaveLength(2);
        expect(
            JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8')).hooks.PostToolUse[0].hooks[0]
                .command,
        ).toContain('node_modules/.bin/spec-tools"; [ ! -x "$f" ] || "$f" steward hook');

        write(dir, 'AGENTS.md', '# Agents\n\nSpecs are guarded by spec-steward.\n');
        write(dir, '.agents/rules/openspec.md', '-');
        write(dir, '.claude/skills/spec-steward/SKILL.md', '-');
        expect(steward(dir, ['wire', '--check']).status).toBe(0);
    });

    test('replaces an edit hook an earlier version wired with the current one, keeping other hooks', () => {
        const dir = repo({ [SPEC_FILE]: SPEC });
        const legacy = 'f="$CLAUDE_PROJECT_DIR/node_modules/.bin/spec-steward"; [ ! -x "$f" ] || "$f" hook';
        const other = { type: 'command', command: 'echo other' };
        write(
            dir,
            '.claude/settings.json',
            JSON.stringify({
                hooks: {
                    PostToolUse: [
                        { matcher: 'Edit', hooks: [{ type: 'command', command: legacy }] },
                        { matcher: 'Write', hooks: [other] },
                    ],
                },
            }),
        );
        expect(steward(dir, ['wire', '--check']).stdout).toContain('✗ .claude/settings.json runs the edit hook');
        steward(dir, ['wire', '--fix']);
        const hooks = JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8')).hooks.PostToolUse;
        expect(
            hooks.map(
                (
                    /**
                     */ e: any,
                ) => e.hooks.map((h: any) => h.command),
            ),
        ).toEqual([['echo other'], [HOOK_COMMAND]]);
    });

    test('replaces guidance an earlier version wrote with the pointer to the spec gate', () => {
        const legacy =
            "operations:\n  apply:\n    guidance:\n      - 'run `node x/steward.mjs check --base <b>`'\n  archive:\n    guidance:\n      - 'keep'\n";
        expect(addGuidance(legacy, 'apply', 'pointer')).toBe(
            legacy.replace("'run `node x/steward.mjs check --base <b>`'", "'pointer'"),
        );
    });

    test('adds guidance to a config without operations', () => {
        expect(addGuidance('schema: spec-driven\n', 'archive', "it's")).toBe(
            "schema: spec-driven\n\noperations:\n  archive:\n    guidance:\n      - 'it''s'\n",
        );
    });
});
