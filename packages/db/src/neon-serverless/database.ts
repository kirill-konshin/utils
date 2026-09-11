import { Pool, type PoolConfig } from '@neondatabase/serverless';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';

import { type DatabaseUrl, resolveDatabaseUrlValue } from '../url';

export type NeonPoolOptions = Omit<PoolConfig, 'connectionString'>;

export type WithNeonDatabaseOptions<TSchema extends Record<string, unknown>> = {
    poolOptions?: NeonPoolOptions;
    schema: TSchema;
    url: DatabaseUrl;
};

export async function withNeonDatabase<TSchema extends Record<string, unknown>, TResult>(
    { poolOptions, schema, url }: WithNeonDatabaseOptions<TSchema>,
    operation: (database: NeonDatabase<TSchema>) => Promise<TResult>,
): Promise<TResult> {
    const pool = new Pool({
        ...poolOptions,
        connectionString: resolveDatabaseUrlValue(url),
        max: poolOptions?.max ?? 1,
    });
    try {
        return await operation(drizzle({ client: pool, schema }));
    } finally {
        await pool.end();
    }
}
