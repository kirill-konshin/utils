import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';

export type DatabaseFor<TSchema extends Record<string, unknown>, TQueryResult extends PgQueryResultHKT> = PgDatabase<
    TQueryResult,
    TSchema,
    ExtractTablesWithRelations<TSchema>
>;

export type DatabaseTransactionFor<
    TSchema extends Record<string, unknown>,
    TQueryResult extends PgQueryResultHKT,
> = PgTransaction<TQueryResult, TSchema, ExtractTablesWithRelations<TSchema>>;

export type DatabaseExecutorFor<TSchema extends Record<string, unknown>, TQueryResult extends PgQueryResultHKT> =
    DatabaseFor<TSchema, TQueryResult> | DatabaseTransactionFor<TSchema, TQueryResult>;

export type TypesFor<TSchema extends Record<string, unknown>> = {
    Database: DatabaseFor<TSchema, PgQueryResultHKT>;
    Transaction: DatabaseTransactionFor<TSchema, PgQueryResultHKT>;
    DatabaseExecutor: DatabaseExecutorFor<TSchema, PgQueryResultHKT>;
};
