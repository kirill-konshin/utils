import assert from 'node:assert/strict';
import { Linter } from 'eslint';
import { test } from 'vitest';

import { vitestConfig } from './testing.js';

const untestedBlocks = (code: string): number =>
    new Linter({ configType: 'flat' })
        .verify(code, vitestConfig(true), { filename: 'src/a.test.js' })
        .filter((message) => message.ruleId === 'vitest/expect-expect').length;

test('vitest: a type assertion counts as the assertion a test needs', () => {
    assert.equal(untestedBlocks("test('t', () => { expectTypeOf(1).toBeNumber(); });\n"), 0);
    assert.equal(untestedBlocks("test('t', () => { assertType(1); });\n"), 0);
    assert.equal(untestedBlocks("test('t', () => { const unused = 1; });\n"), 1);
});
