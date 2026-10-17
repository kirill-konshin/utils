import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { cleanTempDirs, SPEC, SPEC_FILE, requirement, cite, repo, steward, anchorsOf } from '../steward.fixture';
import { scanCitations } from './citations';
import { loadCorpus } from './corpus';
import { coverageReport } from './coverage';

// Every case drives git; on a loaded machine one process start can take seconds.
vi.setConfig({ testTimeout: 300_000 });

afterEach(cleanTempDirs);

describe('coverage', () => {
    test('statuses come from bindings and markers only, and the Markdown is MDX-safe', () => {
        const dir = repo({
            [SPEC_FILE]: `${SPEC.replace('The service SHALL keep', '**⚠️ Advisory:** a {judgement} <x>.\n\nThe service SHALL keep')}${requirement(
                'Refunds are idempotent',
                'A refund SHALL apply once.',
                ['A repeat', 'A first refund'],
                "\n**⚠️ Known gap (PROJ-9):** exempts scenario 'A repeat': no store | yet.\n**⚠️ Unenforced:** old.\n",
            )}`,
            'apps/a.test.ts': `// ${cite('scenario-a-confirmation-times-out')}\ntest('t', () => {});\n`,
            'apps/a.ts': `// ${cite('scenario-a-confirmation-succeeds')}\n`,
        });
        const { markdown: md, totals } = coverageReport(loadCorpus(dir), scanCitations(dir, anchorsOf));
        expect(totals).toMatchObject({ requirements: 3, advisory: 1, gaps: 1, unboundRequirements: 1, retired: 1 });
        expect(md).toContain(
            '3 requirements across 1 capabilities. **1** advisory; **1** known gaps; **1** REQUIRED requirements bound by no test; **3** REQUIRED scenarios bound by no test; **1** retired markers.',
        );
        const row = (label: string) => md.split('\n').find((l) => l.includes(`[${label}]`));
        expect(row('Orders are confirmed once')).toMatch(/\| tested \|$/);
        expect(row('A confirmation times out')).toMatch(/`apps\/a\.test\.ts:1` \| — \| bound \|$/);
        expect(row('A confirmation succeeds')).toMatch(/\| — \| `apps\/a\.ts:1` \| no test \|$/);
        expect(row('Payloads stay lean')).toMatch(/\| advisory \|$/);
        expect(row('Lean payload')).toMatch(/\| — \| — \| — \|$/);
        expect(row('Refunds are idempotent')).toMatch(/\| known gap \(PROJ-9\) \|$/);
        expect(row('A repeat')).toMatch(/\| known gap \(PROJ-9\) \|$/);
        expect(row('A first refund')).toMatch(/\| no test \|$/);
        expect(md).toContain("exempts scenario 'A repeat': no store \\| yet.");
        expect(md).toMatch(
            /## Retired markers\n\n- `openspec\/specs\/demo\/spec\.md:\d+` \*\*⚠️ Unenforced:\*\* old\./,
        );
        expect(md).not.toMatch(/\{judgement\}|<x>/);

        const res = steward(dir, ['coverage', '--out', 'cov.md']);
        expect([res.status, fs.readFileSync(path.join(dir, 'cov.md'), 'utf8')]).toEqual([0, md]);
    });
});
