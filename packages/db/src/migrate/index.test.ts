import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    database: { kind: 'migration-database' },
    drizzle: vi.fn(),
    end: vi.fn<() => Promise<void>>(),
    migrate: vi.fn<() => Promise<void>>(),
    poolOptions: [] as unknown[],
}));

vi.mock('@neondatabase/serverless', () => ({
    Pool: class {
        constructor(options: unknown) {
            mocks.poolOptions.push(options);
        }

        end(): Promise<void> {
            return mocks.end();
        }
    },
}));

vi.mock('drizzle-orm/neon-serverless', () => ({ drizzle: mocks.drizzle }));
vi.mock('drizzle-orm/neon-serverless/migrator', () => ({ migrate: mocks.migrate }));

import { migrateNeonDatabase } from './migrate';

beforeEach(() => {
    mocks.drizzle.mockReset();
    mocks.drizzle.mockReturnValue(mocks.database);
    mocks.end.mockReset();
    mocks.end.mockResolvedValue();
    mocks.migrate.mockReset();
    mocks.migrate.mockResolvedValue();
    mocks.poolOptions.length = 0;
});

test('forwards the migrations folder and closes its pool', async () => {
    await migrateNeonDatabase({ migrationsFolder: '/app/drizzle', url: 'postgres://example' });

    expect(mocks.poolOptions).toStrictEqual([{ connectionString: 'postgres://example', max: 1 }]);
    expect(mocks.migrate).toHaveBeenCalledWith(mocks.database, { migrationsFolder: '/app/drizzle' });
    expect(mocks.end).toHaveBeenCalledOnce();
});

test('closes its pool and propagates migration failures', async () => {
    const error = new Error('migration failed');
    mocks.migrate.mockRejectedValueOnce(error);

    await expect(migrateNeonDatabase({ migrationsFolder: 'drizzle', url: 'postgres://example' })).rejects.toBe(error);
    expect(mocks.end).toHaveBeenCalledOnce();
});
