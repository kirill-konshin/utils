/**
 * Shared fixtures of the steward tests: a throwaway git repository per case, the published CLI, a demo spec and
 * citation helpers. Each test file registers `afterEach(cleanTempDirs)`.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanCitations } from './lib/citations';
import { loadCorpus, parseSpec } from './lib/corpus';
import { coverageReport } from './lib/coverage';
import { runCheck } from './steward';

/** The published bundle — the package's `test` script builds it first. */
export const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../skills/spec-tools/scripts/cli.js');
export const dirs: string[] = [];

export const SPEC = `# demo Specification

## Purpose

Demo.

## Requirements

### Requirement: Orders are confirmed once

The service SHALL confirm an order exactly once and MUST NOT retry a confirmation that timed out.

#### Scenario: A confirmation times out

- **WHEN** the confirmation call to \`confirmOrder\` times out
- **THEN** the order is reported unknown and is not confirmed again

#### Scenario: A confirmation succeeds

- **WHEN** \`confirmOrder\` answers
- **THEN** the order is confirmed

### Requirement: Payloads stay lean

The service SHALL keep payloads lean, as implemented in \`apps/api/src/payload.ts\`.

#### Scenario: Lean payload

- **WHEN** the service keeps payloads lean
- **THEN** payloads are lean
`;
export const SPEC_FILE = 'openspec/specs/demo/spec.md';

/** A requirement block to append to SPEC; `extra` goes between its statement and its scenarios. */
export const requirement = (name: string, statement: string, scenarios: string[], extra = '') =>
    `\n### Requirement: ${name}\n\n${statement}\n${extra}${scenarios
        .map(
            (s: string) => `\n#### Scenario: ${s}\n\n- **WHEN** ${s.toLowerCase()} happens\n- **THEN** it is handled\n`,
        )
        .join('')}`;
/** 1-based line of the first line containing `needle`. */
export const lineOf = (text: string, needle: string) => text.split('\n').findIndex((l) => l.includes(needle)) + 1;
export const cite = (anchor: string) => `{@link ${SPEC_FILE}#${anchor}}`;

export const ENV = { ...process.env, CI: '', CI_MERGE_REQUEST_DIFF_BASE_SHA: '' };
export const GIT_ENV = {
    ...ENV,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
};
export const git = (dir: string, ...args: string[]) =>
    spawnSync('git', args, { cwd: dir, env: GIT_ENV, encoding: 'utf8' }).stdout.trim();

export const write = (dir: string, file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
};

/** A git repository with the given files committed on `main`, which `origin/main` also names. */
export function repo(files: Record<string, string>) {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'steward-')));
    dirs.push(dir);
    for (const [file, text] of Object.entries(files)) write(dir, file, text);
    spawnSync(
        'sh',
        [
            '-c',
            'git init -q -b main && git add -A && git commit -q -m base && git update-ref refs/remotes/origin/main HEAD',
        ],
        { cwd: dir, env: GIT_ENV },
    );
    return dir;
}

export const rootOf = (dir: string) => ({ name: path.basename(dir), path: dir, specsDir: 'openspec/specs' });
/** Findings of one in-process check run, as `spec-tools steward check` computes them. */
export const check = (dir: string, opts: Record<string, unknown> = {}) => {
    const run = runCheck(rootOf(dir), opts);
    return { ...run, of: (kind: string) => run.findings.filter((f) => f.kind === kind) };
};
export const steward = (
    dir: string,
    args: string[],
    { input, env }: { input?: string; env?: Record<string, string> } = {},
) => spawnSync('node', [CLI, 'steward', ...args], { cwd: dir, input, encoding: 'utf8', env: { ...ENV, ...env } });
export const anchorsOf = (text: string) => parseSpec(text, '', '').slugs;
/** The coverage report's row for a requirement or scenario, by its title. */
export const coverageRow = (dir: string, title: string) =>
    coverageReport(loadCorpus(dir), scanCitations(dir, anchorsOf))
        .markdown.split('\n')
        .find((l) => l.includes(`[${title}]`));

/** Removes the repositories the finished case created. */
export function cleanTempDirs() {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
}
