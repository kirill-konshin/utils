import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';

import { type DatabaseUrl, resolveDatabaseUrlValue } from '../url';

export type CreateNeonHttpDatabaseOptions<TSchema extends Record<string, unknown>> = {
    schema: TSchema;
    url: DatabaseUrl;
};

export const createNeonHttpDatabase = <TSchema extends Record<string, unknown>>({
    schema,
    url,
}: CreateNeonHttpDatabaseOptions<TSchema>): NeonHttpDatabase<TSchema> =>
    drizzle(resolveDatabaseUrlValue(url), { schema });
