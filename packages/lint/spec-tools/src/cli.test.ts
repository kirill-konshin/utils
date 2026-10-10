import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

/** The published bundle — the package's `test` script builds it first. */
const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.mjs');
/** A test that spawns git and the CLI in a throwaway repository: each can take seconds on a busy machine. */
const TIMEOUT = 60_000;

const requirement = (name: string) =>
    `### Requirement: ${name}\n\nbody\n\n#### Scenario: s\n\n- **WHEN** x\n- **THEN** y\n`;

/** A repository with one committed capability, and a second requirement added in the working tree. */
const repository = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-tools-cli-'));
    const spec = path.join(dir, 'openspec', 'specs', 'cap', 'spec.md');
    fs.mkdirSync(path.dirname(spec), { recursive: true });
    fs.writeFileSync(spec, `# cap\n\n## Requirements\n\n${requirement('One')}`);
    const git = (...args: string[]) =>
        execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir });
    git('init', '-q');
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    fs.appendFileSync(spec, `\n${requirement('Two')}`);
    return dir;
};

// Outside CI: a CI_* variable inherited from the pipeline running these tests would pick another base.
const run = (dir: string, ...args: string[]) =>
    spawnSync(process.execPath, [cli, ...args], {
        cwd: dir,
        encoding: 'utf8',
        env: { PATH: process.env.PATH, HOME: os.homedir() },
    });

describe('spec-tools diff', () => {
    test(
        'diffs against the default base, never taking the command name for a revision',
        () => {
            const result = run(repository(), 'diff');
            expect(result.stderr).toBe('');
            expect(result.stdout.split('\n')[0]).toBe(
                'SPEC DIFF 1 changed (1 added, 0 modified, 0 removed, 0 renamed)',
            );
        },
        TIMEOUT,
    );

    test(
        'diffs against the base it is given',
        () => {
            const result = run(repository(), 'diff', 'HEAD');
            expect(result.status).toBe(0);
            expect(result.stdout.split('\n')[0]).toBe(
                'SPEC DIFF 1 changed (1 added, 0 modified, 0 removed, 0 renamed)',
            );
        },
        TIMEOUT,
    );
});
