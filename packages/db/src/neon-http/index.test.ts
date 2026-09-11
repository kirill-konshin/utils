import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    database: { kind: 'http-database' },
    drizzle: vi.fn(),
}));

vi.mock('drizzle-orm/neon-http', () => ({ drizzle: mocks.drizzle }));

import { createNeonHttpDatabase } from './database';

beforeEach(() => {
    mocks.drizzle.mockReset();
    mocks.drizzle.mockReturnValue(mocks.database);
});

test('creates a schema-aware HTTP database only when called', () => {
    const schema = { users: { name: 'users' } };
    const url = vi.fn(() => 'postgres://example');

    expect(mocks.drizzle).not.toHaveBeenCalled();
    expect(url).not.toHaveBeenCalled();
    expect(createNeonHttpDatabase({ schema, url })).toBe(mocks.database);
    expect(url).toHaveBeenCalledOnce();
    expect(mocks.drizzle).toHaveBeenCalledWith('postgres://example', { schema });
});
