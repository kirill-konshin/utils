import type { NeonHttpDatabase, NeonHttpQueryResultHKT } from 'drizzle-orm/neon-http';
import type { NeonDatabase, NeonQueryResultHKT } from 'drizzle-orm/neon-serverless';
import { pgTable, text } from 'drizzle-orm/pg-core';
import type { PgliteDatabase, PgliteQueryResultHKT } from 'drizzle-orm/pglite';
import { expect, expectTypeOf, test } from 'vitest';

import type { DatabaseExecutorFor, DatabaseFor, DatabaseTransactionFor } from './database';

const users = pgTable('users', { id: text().primaryKey() });
const schema = { users };

type IsAssignable<TValue, TTarget> = TValue extends TTarget ? true : false;

test('keeps schema inference across Neon and PGlite executors', () => {
    expect(users.id.name).toBe('id');
    expectTypeOf<
        IsAssignable<NeonHttpDatabase<typeof schema>, DatabaseFor<typeof schema, NeonHttpQueryResultHKT>>
    >().toEqualTypeOf<true>();
    expectTypeOf<
        IsAssignable<NeonDatabase<typeof schema>, DatabaseFor<typeof schema, NeonQueryResultHKT>>
    >().toEqualTypeOf<true>();
    expectTypeOf<
        IsAssignable<PgliteDatabase<typeof schema>, DatabaseFor<typeof schema, PgliteQueryResultHKT>>
    >().toEqualTypeOf<true>();
    expectTypeOf<
        IsAssignable<PgliteDatabase<typeof schema>, DatabaseExecutorFor<typeof schema, PgliteQueryResultHKT>>
    >().toEqualTypeOf<true>();
    expectTypeOf<
        IsAssignable<
            DatabaseTransactionFor<typeof schema, PgliteQueryResultHKT>,
            DatabaseExecutorFor<typeof schema, PgliteQueryResultHKT>
        >
    >().toEqualTypeOf<true>();
});
