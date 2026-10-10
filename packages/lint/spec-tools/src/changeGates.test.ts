import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, test } from 'vitest';

import {
    malformedArchivedChanges,
    openChanges,
    skipSpecsWithDeltas,
    specMovesSince,
    staleDeltaTargets,
    syncedUnarchivedChanges,
    touchedOpenChanges,
} from './changeGates';
import { gateBase } from './ci';

/**
 * Tests of the change gates' FUNCTIONS. Whether this repository's changes pass them is a statement about repository
 * state, not about code, and runs as `spec-tools gates` in its own CI job with its own verdict. Nothing here may turn
 * red because of what state the branch is in.
 */

/** A throwaway repository: capabilities in main, changes open and archived, as the test dictates. */
const repo = (layout: Record<string, string>) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-tools-change-gates-'));
    for (const [rel, content] of Object.entries(layout)) {
        const full = path.join(dir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content);
    }
    return dir;
};
const commitAll = (dir: string) => {
    const run = (...args: string[]) =>
        execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir });
    run('init', '-q');
    run('add', '.');
    run('commit', '-q', '-m', 'base');
    return run;
};
const requirement = (name: string) =>
    `### Requirement: ${name}\n\nbody\n\n#### Scenario: s\n\n- **WHEN** x\n- **THEN** y\n`;
/** A test that spawns git in a throwaway repository: each command can take seconds on a busy machine. */
const GIT_TIMEOUT = 60_000;

describe('malformedArchivedChanges', () => {
    test('accepts an archived change with its marker, its proposal, and a delta', () => {
        const dir = repo({
            'openspec/changes/archive/2026-01-01-ok/.openspec.yaml': 'schema: spec-driven\n',
            'openspec/changes/archive/2026-01-01-ok/proposal.md': '## Why\n',
            'openspec/changes/archive/2026-01-01-ok/specs/cap/spec.md': '## ADDED Requirements\n',
        });
        expect(malformedArchivedChanges(dir)).toEqual([]);
    });

    test('names an archived change that is an empty directory tree', () => {
        const dir = repo({});
        fs.mkdirSync(path.join(dir, 'openspec/changes/archive/2026-01-01-empty/specs/cap'), { recursive: true });
        expect(malformedArchivedChanges(dir)).toEqual(['2026-01-01-empty — missing .openspec.yaml and proposal.md']);
    });

    test('names an archived change committed without its proposal', () => {
        const dir = repo({ 'openspec/changes/archive/2026-01-01-x/.openspec.yaml': 'schema: spec-driven\n' });
        expect(malformedArchivedChanges(dir)).toEqual(['2026-01-01-x — missing proposal.md']);
    });

    test('names a specs tree whose delta was dropped', () => {
        const dir = repo({
            'openspec/changes/archive/2026-01-01-x/.openspec.yaml': 'schema: spec-driven\n',
            'openspec/changes/archive/2026-01-01-x/proposal.md': '## Why\n',
        });
        fs.mkdirSync(path.join(dir, 'openspec/changes/archive/2026-01-01-x/specs/cap'), { recursive: true });
        expect(malformedArchivedChanges(dir)).toEqual(['2026-01-01-x — carries a specs/ tree with no delta file']);
    });
});

describe('syncedUnarchivedChanges', () => {
    const withMain = (mainReqs: string[], delta: string) =>
        repo({
            'openspec/specs/cap/spec.md': mainReqs.map(requirement).join('\n'),
            'openspec/changes/open/specs/cap/spec.md': delta,
        });

    test('is clean for an unsynced change: its ADDED are absent and its REMOVED still present', () => {
        const dir = withMain(
            ['Old rule', 'Kept rule'],
            '## ADDED Requirements\n\n### Requirement: New rule\n\n## REMOVED Requirements\n\n### Requirement: Old rule\n',
        );
        expect(syncedUnarchivedChanges(dir)).toEqual([]);
    });

    test('reports an ADDED requirement already in main', () => {
        const dir = withMain(['Kept rule', 'New rule'], '## ADDED Requirements\n\n### Requirement: New rule\n');
        expect(syncedUnarchivedChanges(dir)).toEqual(['open — ADDED "New rule" is already in cap']);
    });

    test('reports a MODIFIED requirement whose block already reads as main does, and not one that still differs', () => {
        const synced = withMain(['Kept rule'], '## MODIFIED Requirements\n\n' + requirement('Kept rule') + '\n');
        expect(syncedUnarchivedChanges(synced)).toEqual(['open — MODIFIED "Kept rule" already reads as cap does']);
        const pending = withMain(
            ['Kept rule'],
            '## MODIFIED Requirements\n\n' + requirement('Kept rule').replace('body', 'changed body') + '\n',
        );
        expect(syncedUnarchivedChanges(pending)).toEqual([]);
    });

    test('reports a REMOVED requirement already gone from main', () => {
        const dir = withMain(['Kept rule'], '## REMOVED Requirements\n\n### Requirement: Old rule\n');
        expect(syncedUnarchivedChanges(dir)).toEqual(['open — REMOVED "Old rule" is already gone from cap']);
    });

    test('does not report a MODIFIED header whose body still differs from main', () => {
        const dir = withMain(['Kept rule'], '## MODIFIED Requirements\n\n### Requirement: Kept rule\n\nnew body\n');
        expect(syncedUnarchivedChanges(dir)).toEqual([]);
    });

    test('ignores the archive directory', () => {
        const dir = repo({
            'openspec/specs/cap/spec.md': requirement('New rule'),
            'openspec/changes/archive/2026-01-01-done/specs/cap/spec.md':
                '## ADDED Requirements\n\n### Requirement: New rule\n',
        });
        expect(syncedUnarchivedChanges(dir)).toEqual([]);
    });
});

describe('skipSpecsWithDeltas', () => {
    test('accepts skip_specs on a change with no deltas', () => {
        const dir = repo({ 'openspec/changes/thesis/.openspec.yaml': 'schema: spec-driven\nskip_specs: true\n' });
        expect(skipSpecsWithDeltas(dir)).toEqual([]);
    });

    test('accepts deltas on a change without skip_specs', () => {
        const dir = repo({
            'openspec/changes/real/.openspec.yaml': 'schema: spec-driven\n',
            'openspec/changes/real/specs/cap/spec.md': '## ADDED Requirements\n',
        });
        expect(skipSpecsWithDeltas(dir)).toEqual([]);
    });

    test('refuses skip_specs on a change that carries deltas, naming the change', () => {
        const dir = repo({
            'openspec/changes/lossy/.openspec.yaml': 'schema: spec-driven\nskip_specs: true\n',
            'openspec/changes/lossy/specs/cap/spec.md': '## ADDED Requirements\n',
        });
        expect(skipSpecsWithDeltas(dir)).toEqual([
            'lossy sets skip_specs: true but carries delta files — archive would discard them',
        ]);
    });

    test('looks into the archive too, where the loss would already have happened', () => {
        const dir = repo({
            'openspec/changes/archive/2026-01-01-lossy/.openspec.yaml': 'skip_specs: true\n',
            'openspec/changes/archive/2026-01-01-lossy/specs/cap/spec.md': '## ADDED Requirements\n',
        });
        expect(skipSpecsWithDeltas(dir)).toEqual([
            'archive/2026-01-01-lossy sets skip_specs: true but carries delta files — archive would discard them',
        ]);
    });
});

describe('specMovesSince', { timeout: GIT_TIMEOUT }, () => {
    test('maps each spec file git sees renamed to its working-tree path, and leaves the rest out', () => {
        const dir = repo({
            'openspec/specs/web/state/spec.md': `# state\n\n## Requirements\n\n${requirement('Moves verbatim')}`,
            'openspec/specs/auth/refresh/spec.md': `# refresh\n\n## Requirements\n\n${requirement('Unmoved')}`,
        });
        const run = commitAll(dir);
        fs.mkdirSync(path.join(dir, 'openspec/specs/apps'), { recursive: true });
        run('mv', 'openspec/specs/web/state', 'openspec/specs/apps/state');

        expect([...specMovesSince('HEAD', dir)]).toEqual([
            ['openspec/specs/web/state/spec.md', 'openspec/specs/apps/state/spec.md'],
        ]);
    });
});

describe('staleDeltaTargets', () => {
    test('names MODIFIED, REMOVED and RENAMED FROM headings the standing spec no longer carries, for the changes asked about only', () => {
        const dir = repo({
            'openspec/specs/cap/spec.md': `${requirement('Kept')}\n${requirement('Also kept')}`,
            'openspec/changes/stale/specs/cap/spec.md':
                '## MODIFIED Requirements\n\n### Requirement: Gone\n\nbody\n\n## REMOVED Requirements\n\n### Requirement: Kept\n\n## RENAMED Requirements\n\n- FROM: `### Requirement: Old`\n- TO: `### Requirement: New`\n',
            'openspec/changes/fresh/specs/cap/spec.md':
                '## MODIFIED Requirements\n\n### Requirement: Also kept\n\nbody\n',
        });
        expect(staleDeltaTargets(['stale', 'fresh'], dir)).toEqual([
            'stale: cap MODIFIED "Gone" names no standing requirement',
            'stale: cap RENAMED FROM "Old" names no standing requirement',
        ]);
        expect(staleDeltaTargets(['fresh'], dir)).toEqual([]);
    });

    test('lists the open changes without the archive', () => {
        const dir = repo({
            'openspec/changes/b/proposal.md': '',
            'openspec/changes/a/proposal.md': '',
            'openspec/changes/archive/x/proposal.md': '',
        });
        expect(openChanges(dir)).toEqual(['a', 'b']);
    });
});

describe('the base a branch is judged against', { timeout: GIT_TIMEOUT }, () => {
    test("is a merge request's diff base, nothing on any other pipeline, and locally the merge base with the default branch", () => {
        const dir = repo({ 'openspec/changes/a/proposal.md': 'a\n' });
        const run = commitAll(dir);
        run('update-ref', 'refs/remotes/origin/main', 'HEAD');
        const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
        expect(gateBase({ CI: 'true', CI_MERGE_REQUEST_DIFF_BASE_SHA: base }, dir)).toBe(base);
        expect(gateBase({ CI: 'true' }, dir)).toBeNull();
        fs.writeFileSync(path.join(dir, 'later.md'), 'x\n');
        run('add', '.');
        run('commit', '-q', '-m', 'later');
        expect(gateBase({}, dir)).toBe(base);
    });

    test('touches the open changes the tree changed or added against that base, never the archive', () => {
        const dir = repo({
            'openspec/changes/edited/proposal.md': 'a\n',
            'openspec/changes/untouched/proposal.md': 'a\n',
        });
        commitAll(dir);
        fs.writeFileSync(path.join(dir, 'openspec/changes/edited/proposal.md'), 'b\n');
        fs.mkdirSync(path.join(dir, 'openspec/changes/new/'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'openspec/changes/new/proposal.md'), 'c\n');
        fs.mkdirSync(path.join(dir, 'openspec/changes/archive/old/'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'openspec/changes/archive/old/proposal.md'), 'd\n');
        expect(touchedOpenChanges('HEAD', dir)).toEqual(['edited', 'new']);
    });
});
