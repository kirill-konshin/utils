import assert from 'node:assert/strict';
import { Linter } from 'eslint';
import { test } from 'vitest';

import { restrictions } from './restrictions.js';

const lint = (config: Linter.Config[], code: string, filename = 'src/a.js'): string[] =>
    new Linter({ configType: 'flat' }).verify(code, config, { filename }).map((m) => `${m.ruleId}: ${m.message}`);

test('two concerns on one core rule both hold where their files overlap', () => {
    const config = restrictions([
        { name: 'no-fs', rule: 'no-restricted-imports', options: [{ paths: ['node:fs'] }], files: ['src/**'] },
        { name: 'no-http', rule: 'no-restricted-imports', options: [{ paths: ['node:http'] }], files: ['**/*.js'] },
    ]);

    const messages = lint(config, "import fs from 'node:fs';\nimport http from 'node:http';\n");

    assert.equal(messages.length, 2, messages.join('\n'));
    assert.ok(messages.some((m) => m.startsWith('restrict/no-fs: ') && m.includes('node:fs')));
    assert.ok(messages.some((m) => m.startsWith('restrict/no-http: ') && m.includes('node:http')));
});

test('entries of one concern differ by label and keep their own files', () => {
    const config = restrictions([
        {
            name: 'layers',
            label: 'app',
            rule: 'no-restricted-imports',
            options: [{ paths: ['db'] }],
            files: ['app/**'],
        },
        { name: 'layers', label: 'db', rule: 'no-restricted-imports', options: [{ paths: ['app'] }], files: ['db/**'] },
    ]);

    assert.deepEqual(
        config.map((entry) => entry.name),
        ['Lint layer', 'Lint layer: layers (app)', 'Lint layer: layers (db)'],
    );
    assert.equal(lint(config, "import x from 'db';\n", 'app/a.js').length, 1);
    assert.equal(lint(config, "import x from 'db';\n", 'db/a.js').length, 0);
});
