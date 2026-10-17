import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { cleanTempDirs, SPEC, SPEC_FILE, repo } from '../steward.fixture';
import { align } from './align';
import { loadCorpus } from './corpus';

// Every case drives git; on a loaded machine one process start can take seconds.
vi.setConfig({ testTimeout: 300_000 });

afterEach(cleanTempDirs);

describe('align', () => {
    test('pairs shared capabilities and reports drift and one-sided rules', () => {
        const a = repo({ [SPEC_FILE]: SPEC });
        const b = repo({
            'openspec/specs/platform/demo/spec.md': SPEC.replace('exactly once', 'once').replace(
                /### Requirement: Payloads[\s\S]*$/,
                '',
            ),
        });
        const [pair] = align(loadCorpus(a), loadCorpus(b));
        expect(pair.requirements.map((r) => r.kind)).toEqual(['drift', 'only-a']);
        expect(pair.requirements[0].onlyA).toContain('exactly');
    });

    test('a scenario only one repository has is not drift: a shared rule is its name and statement', () => {
        const a = repo({ [SPEC_FILE]: SPEC });
        const b = repo({
            [SPEC_FILE]: SPEC.replace(
                '- **THEN** the order is confirmed\n',
                '- **THEN** the order is confirmed\n\n#### Scenario: A repository-only case\n\n- **WHEN** an order is replayed\n- **THEN** it is confirmed once\n',
            ),
        });
        const [pair] = align(loadCorpus(a), loadCorpus(b));
        expect(pair.requirements.map((r) => r.kind)).toEqual(['identical', 'identical']);
    });
});
