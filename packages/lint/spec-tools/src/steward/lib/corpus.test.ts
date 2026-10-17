import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { cleanTempDirs, SPEC, SPEC_FILE, requirement, repo, check } from '../steward.fixture';
import { slugify } from './util';

// Every case drives git; on a loaded machine one process start can take seconds.
vi.setConfig({ testTimeout: 300_000 });

afterEach(cleanTempDirs);

describe('anchors', () => {
    test('match the rendered heading slugs, repeats included', () => {
        const seen = new Map();
        expect(slugify("Requirement: A changed requirement's evidence — assembled")).toBe(
            'requirement-a-changed-requirements-evidence--assembled',
        );
        expect([slugify('Scenario: x', seen), slugify('Scenario: x', seen), slugify('Scenario: x', seen)]).toEqual([
            'scenario-x',
            'scenario-x-1',
            'scenario-x-2',
        ]);
    });

    test('a heading that renders an earlier slug again is a duplicate-anchor error', () => {
        const spec = `${SPEC}${requirement('Refunds are idempotent', 'A refund SHALL apply once.', ['A confirmation succeeds'])}`;
        const dir = repo({ [SPEC_FILE]: spec });
        expect(check(dir).of('duplicate-anchor')).toEqual([
            expect.objectContaining({
                severity: 'error',
                line: spec.split('\n').lastIndexOf('#### Scenario: A confirmation succeeds') + 1,
                message: expect.stringContaining('#scenario-a-confirmation-succeeds'),
            }),
        ]);
    });
});
