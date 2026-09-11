import { Pool, type PoolConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';

import { type DatabaseUrl, resolveDatabaseUrlValue } from '../url';

export type MigrateNeonDatabaseOptions = {
    migrationsFolder: string;
    poolOptions?: Omit<PoolConfig, 'connectionString'>;
    url: DatabaseUrl;
};

export async function migrateNeonDatabase({
    migrationsFolder,
    poolOptions,
    url,
}: MigrateNeonDatabaseOptions): Promise<void> {
    const pool = new Pool({
        ...poolOptions,
        connectionString: resolveDatabaseUrlValue(url),
        max: poolOptions?.max ?? 1,
    });
    try {
        await migrate(drizzle({ client: pool }), { migrationsFolder });
    } finally {
        await pool.end();
    }
}
