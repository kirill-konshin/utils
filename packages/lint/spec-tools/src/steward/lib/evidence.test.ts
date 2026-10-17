import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { cleanTempDirs, SPEC, SPEC_FILE, cite, repo, steward, anchorsOf } from '../steward.fixture';
import { scanCitations } from './citations';
import { loadCorpus } from './corpus';
import { evidenceModel, sourceIndex } from './evidence';
import { forget } from './git';

// Every case drives git; on a loaded machine one process start can take seconds.
vi.setConfig({ testTimeout: 300_000 });

afterEach(cleanTempDirs);

describe('evidence --json', () => {
    test('bound tests, pointers, term hits in comment-stripped sources, gaps and class for every requirement', () => {
        const dir = repo({
            [SPEC_FILE]: SPEC.replace('The service SHALL keep', '**⚠️ Advisory:** taste.\n\nThe service SHALL keep'),
            'apps/order.ts': `// confirmOrder in a comment\nexport const confirmOrder = () => 1;\n// ${cite('requirement-orders-are-confirmed-once')}\n`,
            'apps/order.test.ts': `// ${cite('scenario-a-confirmation-succeeds')}\ntest('answers', () => confirmOrder());\n`,
        });
        const res = steward(dir, ['evidence', '--json']);
        expect(res.status).toBe(0);
        const model = JSON.parse(res.stdout);
        forget();
        expect(model).toEqual(evidenceModel(loadCorpus(dir), scanCitations(dir, anchorsOf), sourceIndex(dir)));
        expect(model).toMatchObject({ version: 1, root: path.basename(dir) });
        const [orders, payloads] = model.requirements;
        expect(Object.keys(orders)).toEqual([
            'id',
            'capability',
            'file',
            'line',
            'end',
            'block',
            'class',
            'gaps',
            'scenarios',
            'bindings',
            'pointers',
            'terms',
            'related',
        ]);
        expect(orders).toMatchObject({
            id: 'demo#requirement-orders-are-confirmed-once',
            capability: 'demo',
            file: SPEC_FILE,
            class: 'required',
            gaps: [],
            bindings: [
                {
                    file: 'apps/order.test.ts',
                    line: 1,
                    anchor: 'scenario-a-confirmation-succeeds',
                    kind: 'test',
                    title: 'answers',
                    window: [1, 2],
                },
            ],
            pointers: [
                {
                    file: 'apps/order.ts',
                    line: 3,
                    anchor: 'requirement-orders-are-confirmed-once',
                    kind: 'code',
                    window: [3, 4],
                },
            ],
            terms: [{ term: 'confirmOrder', hits: [{ file: 'apps/order.ts', line: 2 }] }],
        });
        expect(orders.scenarios.map((s: { slug: string; bound: boolean }) => [s.slug, s.bound])).toEqual([
            ['scenario-a-confirmation-times-out', false],
            ['scenario-a-confirmation-succeeds', true],
        ]);
        expect(payloads.class).toBe('advisory');
    });
});
