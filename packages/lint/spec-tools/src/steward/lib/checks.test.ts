import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import {
    cleanTempDirs,
    SPEC,
    SPEC_FILE,
    requirement,
    lineOf,
    cite,
    write,
    repo,
    check,
    anchorsOf,
    coverageRow,
} from '../steward.fixture';
import { scanCitations } from './citations';
import { loadCorpus } from './corpus';
import { coverageReport } from './coverage';

// Every case drives git; on a loaded machine one process start can take seconds.
vi.setConfig({ testTimeout: 300_000 });

afterEach(cleanTempDirs);

describe('the scenario ratchet', () => {
    const added = requirement('Refunds are idempotent', 'A refund SHALL be applied at most once per request id.', [
        'A repeat',
        'A first refund',
    ]);
    const ratchet = (dir: string, opts: Record<string, unknown> = {}) =>
        check(dir, { base: 'main', ...opts }).of('scenario-unproven');

    test('fails a new or modified scenario of a REQUIRED requirement that nothing binds, at file:line', () => {
        const dir = repo({ [SPEC_FILE]: SPEC });
        write(dir, SPEC_FILE, `${SPEC}${added}`);
        expect(ratchet(dir).map((f) => [f.severity, f.file, f.line, f.message.slice(0, 22)])).toEqual([
            ['error', SPEC_FILE, lineOf(`${SPEC}${added}`, 'Scenario: A repeat'), 'scenario "A repeat" is'],
            ['error', SPEC_FILE, lineOf(`${SPEC}${added}`, 'Scenario: A first'), 'scenario "A first refu'],
        ]);

        const edited = SPEC.replace('the order is confirmed\n', 'the order is confirmed and logged\n');
        write(dir, SPEC_FILE, edited);
        expect(ratchet(dir).map((f) => [f.severity, f.line])).toEqual([
            ['error', lineOf(edited, 'Scenario: A confirmation succeeds')],
        ]);
    });

    test('a test block, its attached comment, a type assertion, a lint entry or a --binds file binds; a header does not', () => {
        const dir = repo({ [SPEC_FILE]: SPEC });
        write(dir, SPEC_FILE, `${SPEC}${added}`);
        write(dir, 'apps/a.test.ts', `// ${cite('scenario-a-repeat')}\nimport x from 'x';\n\ntest('t', () => {});\n`);
        const header = check(dir, { base: 'main' });
        expect(header.of('scenario-unproven')).toHaveLength(2);
        expect(header.findings.filter((f) => f.file === 'apps/a.test.ts')).toEqual([]);

        write(dir, 'apps/a.test.ts', `// ${cite('scenario-a-repeat')}\nit('t', () => {});\n`);
        write(dir, 'apps/b.test-d.ts', `// ${cite('scenario-a-first-refund')}\ntype _x = Expect<Equal<1, 1>>;\n`);
        expect(ratchet(dir)).toEqual([]);

        fs.rmSync(path.join(dir, 'apps/b.test-d.ts'));
        write(dir, 'eslint.config.mjs', `export default [\n    // ${cite('scenario-a-first-refund')}\n    {},\n];\n`);
        expect(ratchet(dir)).toEqual([]);

        fs.rmSync(path.join(dir, 'eslint.config.mjs'));
        write(
            dir,
            'vite.config.ts',
            `export default {\n    // ${cite('scenario-a-first-refund')}\n    lint: {},\n};\n`,
        );
        expect(ratchet(dir)).toEqual([]);

        fs.rmSync(path.join(dir, 'vite.config.ts'));
        write(dir, 'yarn.config.cjs', `// ${cite('scenario-a-first-refund')}\nmodule.exports = {};\n`);
        expect(ratchet(dir)).toEqual([]);

        fs.rmSync(path.join(dir, 'yarn.config.cjs'));
        write(dir, 'scripts/checks/refunds.sh', `# ${cite('scenario-a-first-refund')}\ntest -f x\n`);
        expect(ratchet(dir)).toHaveLength(1);
        expect(ratchet(dir, { binds: ['scripts/checks/**'] })).toEqual([]);
        // The repository's own binds, declared once in its package.json.
        write(dir, 'package.json', JSON.stringify({ 'spec-steward': { binds: ['scripts/checks/**'] } }));
        expect(ratchet(dir)).toEqual([]);
    });

    test("a requirement's anchor binds only its one scenario", () => {
        const one = requirement('Refunds are idempotent', 'A refund SHALL be applied once.', ['A repeat']);
        const dir = repo({ [SPEC_FILE]: SPEC });
        write(dir, SPEC_FILE, `${SPEC}${one}`);
        write(dir, 'apps/a.test.ts', `// ${cite('requirement-refunds-are-idempotent')}\ntest('t', () => {});\n`);
        expect(ratchet(dir)).toEqual([]);
        write(dir, SPEC_FILE, `${SPEC}${added}`);
        expect(ratchet(dir)).toHaveLength(2);
    });

    test('a Known gap exempts the scenarios it names by title; nothing else does', () => {
        const dir = repo({ [SPEC_FILE]: SPEC });
        const gap = (text: string) =>
            `${SPEC}${requirement('Refunds are idempotent', 'A refund SHALL be applied at most once per request id.', ['A repeat', 'A first refund'], `\n${text}\n`)}`;
        let spec = gap("**⚠️ Known gap (PROJ-1):** exempts scenario 'A repeat': no store yet.");
        write(dir, SPEC_FILE, spec);
        expect(ratchet(dir).map((f) => f.line)).toEqual([lineOf(spec, 'Scenario: A first')]);

        write(dir, SPEC_FILE, gap('**⚠️ Known gap (PROJ-1):** no store yet.'));
        expect(ratchet(dir)).toHaveLength(2);
        expect(coverageRow(dir, 'Refunds are idempotent')).toMatch(/\| known gap \(PROJ-1\) \|$/);
        expect([coverageRow(dir, 'A repeat'), coverageRow(dir, 'A first refund')]).toEqual([
            expect.stringMatching(/\| no test \|$/),
            expect.stringMatching(/\| no test \|$/),
        ]);
        expect(coverageReport(loadCorpus(dir), scanCitations(dir, anchorsOf)).markdown).toMatch(
            /## Known gaps\n\n\| Tracker \| Requirement \| Gap \|\n\| --- \| --- \| --- \|\n\| PROJ-1 \| \[demo#requirement-refunds-are-idempotent\]/,
        );

        // Inside a scenario's block a Known gap exempts nothing, and is reported.
        spec = `${SPEC}${added}\n**⚠️ Known gap (openspec/changes/refunds):** not built.\n`;
        write(dir, SPEC_FILE, spec);
        expect(ratchet(dir)).toHaveLength(2);
        expect(check(dir, { base: 'main' }).of('marker-hygiene')[0].message).toContain(
            'inside a scenario it grants nothing',
        );

        write(dir, SPEC_FILE, gap('**⚠️ Known gap:** exempts scenario _A repeat_.'));
        const run = check(dir, { base: 'main' });
        expect(run.of('scenario-unproven')).toHaveLength(2);
        expect(run.of('marker-hygiene')[0].message).toContain('names its tracker');

        write(dir, SPEC_FILE, gap("**⚠️ Unenforced:** exempts scenario 'A repeat'."));
        expect(ratchet(dir)).toHaveLength(2);
    });

    test('an advisory requirement, an unchanged scenario and a verbatim move ask nothing; coverage lists the unbound', () => {
        const dir = repo({ [SPEC_FILE]: `${SPEC}${added}` });
        write(dir, SPEC_FILE, `${SPEC}${added.replace('A refund SHALL', 'Refunds: a refund SHALL')}`);
        expect(ratchet(dir)).toEqual([]);
        expect(coverageRow(dir, 'A repeat')).toMatch(/\| no test \|$/);

        write(dir, SPEC_FILE, SPEC);
        write(dir, 'openspec/specs/refunds/spec.md', `# refunds\n\n## Purpose\n\nR.\n\n## Requirements\n${added}`);
        expect(ratchet(dir)).toEqual([]);

        fs.rmSync(path.join(dir, 'openspec/specs/refunds'), { recursive: true });
        const repeat = '\n#### Scenario: A repeat\n\n- **WHEN** a repeat happens\n- **THEN** it is handled\n';
        write(dir, SPEC_FILE, `${SPEC}${repeat}${added.replace(repeat, '')}`);
        expect(ratchet(dir)).toEqual([]);

        write(dir, SPEC_FILE, `${SPEC}${added.replace('A repeat\n', 'A second repeat\n')}`);
        expect(ratchet(dir)).toHaveLength(1);
        write(
            dir,
            SPEC_FILE,
            `${SPEC}${added.replace('A refund SHALL', '**⚠️ Advisory:** conduct.\n\nA refund SHALL').replace('A repeat\n', 'A second repeat\n')}`,
        );
        expect(ratchet(dir)).toEqual([]);
    });
});
