import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { cleanTempDirs, SPEC, SPEC_FILE, cite, git, write, repo, check, steward } from '../steward.fixture';
import { type Finding } from './checks';

// Every case drives git; on a loaded machine one process start can take seconds.
vi.setConfig({ testTimeout: 300_000 });

afterEach(cleanTempDirs);

describe('--base', () => {
    test('auto takes the merge request diff base in CI, nothing in another CI pipeline, the merge base locally', () => {
        const dir = repo({ [SPEC_FILE]: SPEC });
        const sha = git(dir, 'rev-parse', 'HEAD');
        write(dir, SPEC_FILE, SPEC.replace('MUST NOT retry', 'SHOULD NOT retry'));
        const run = (env: Record<string, string>) => {
            const res = steward(dir, ['check', '--json', '--base', 'auto'], { env });
            return { stderr: res.stderr, findings: JSON.parse(res.stdout) as Finding[] };
        };

        const mr = run({ CI: 'true', CI_MERGE_REQUEST_DIFF_BASE_SHA: sha });
        expect(mr.stderr).toContain(`base: ${sha} (the merge request diff base)`);
        expect(mr.findings.filter((f) => f.kind === 'weakened')).toHaveLength(1);

        const pipeline = run({ CI: 'true' });
        expect(pipeline.stderr).toMatch(
            /base: none — a CI pipeline outside a merge request\n {2}skipped: weakened, new-requirement, renamed-anchor, scenario-unproven, non-ears, non-bdd; prompts not printed/,
        );
        expect(pipeline.findings.filter((f) => f.severity === 'info' || f.kind === 'weakened')).toEqual([]);

        const local = run({});
        expect(local.stderr).toContain(`base: ${sha} (merge base of origin/main)`);
        expect(local.findings.filter((f) => f.kind === 'weakened')).toHaveLength(1);
    });

    test('under a base, prompts cover only what the diff added or edited, and citations in changed files', () => {
        const dir = repo({
            [SPEC_FILE]: SPEC,
            'apps/old.test.ts': `// ${cite('requirement-orders-are-confirmed-once')}\ntest('t', () => {});\n`,
        });
        write(dir, SPEC_FILE, SPEC.replace('keep payloads lean', 'keep payloads appropriately lean'));
        const prompts = check(dir, { base: 'main' }).findings.filter((f) => f.severity === 'info');
        expect(new Set(prompts.map((f) => f.id))).toEqual(new Set(['demo#requirement-payloads-stay-lean']));
        expect(prompts.map((f) => f.kind)).toEqual(expect.arrayContaining(['vague-obligation', 'impl-detail']));
        expect(check(dir).of('unbound-test')).toHaveLength(1);
        expect(check(dir, { base: 'main' }).of('unbound-test')).toEqual([]);

        write(dir, 'apps/old.test.ts', `// ${cite('requirement-orders-are-confirmed-once')}\ntest('u', () => {});\n`);
        expect(check(dir, { base: 'main' }).of('unbound-test')).toHaveLength(1);
    });

    test('non-ears and non-bdd judge new text only, and never fail', () => {
        const dir = repo({ [SPEC_FILE]: SPEC });
        write(
            dir,
            SPEC_FILE,
            `${SPEC}\n### Requirement: Refunds\n\nRefunds MUST be idempotent.\n\n#### Scenario: Repeat\n\n- **THEN** nothing\n\n### Requirement: Credits\n\nWhen a credit arrives, the ledger SHALL book it.\n\n#### Scenario: Book\n\n- **GIVEN** a ledger\n- **WHEN** a credit arrives\n- **THEN** it is booked\n`,
        );
        const run = check(dir, { base: 'main' });
        expect(run.of('non-ears').map((f) => [f.id, f.severity])).toEqual([['demo#requirement-refunds', 'info']]);
        expect(run.of('non-ears')[0].message).toContain('When <trigger>, the <system> SHALL <response>');
        expect(run.of('non-bdd').map((f) => f.message)).toEqual([expect.stringContaining('"Repeat" lacks WHEN/THEN')]);
    });
});
