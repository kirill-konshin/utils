import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    database: { kind: 'serverless-database' },
    drizzle: vi.fn(),
    end: vi.fn<() => Promise<void>>(),
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

import { withNeonDatabase } from './database';

beforeEach(() => {
    mocks.drizzle.mockReset();
    mocks.drizzle.mockReturnValue(mocks.database);
    mocks.end.mockReset();
    mocks.end.mockResolvedValue();
    mocks.poolOptions.length = 0;
});

test('returns the callback result and closes its pool', async () => {
    const schema = { users: { name: 'users' } };
    const operation = vi.fn(async () => 'result');

    await expect(
        withNeonDatabase({ poolOptions: { max: 2 }, schema, url: 'postgres://example' }, operation),
    ).resolves.toBe('result');
    expect(mocks.poolOptions).toStrictEqual([{ connectionString: 'postgres://example', max: 2 }]);
    expect(operation).toHaveBeenCalledWith(mocks.database);
    expect(mocks.end).toHaveBeenCalledOnce();
});

test('closes its pool when the callback fails without replacing the error', async () => {
    const error = new Error('query failed');

    await expect(
        withNeonDatabase({ schema: {}, url: 'postgres://example' }, async () => Promise.reject(error)),
    ).rejects.toBe(error);
    expect(mocks.end).toHaveBeenCalledOnce();
});

test('closes its pool when Drizzle setup fails', async () => {
    const error = new Error('setup failed');
    mocks.drizzle.mockImplementationOnce(() => {
        throw error;
    });

    await expect(withNeonDatabase({ schema: {}, url: 'postgres://example' }, async () => undefined)).rejects.toBe(
        error,
    );
    expect(mocks.end).toHaveBeenCalledOnce();
});
