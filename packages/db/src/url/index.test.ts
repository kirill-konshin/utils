import { describe, expect, test, vi } from 'vitest';

import { resolveDatabaseUrl, resolveDatabaseUrlValue } from './databaseUrl';

describe('database URL resolution', () => {
    test('uses DATABASE_URL at runtime', () => {
        expect(resolveDatabaseUrl({ DATABASE_URL: 'runtime', DATABASE_URL_UNPOOLED: 'direct' })).toBe('runtime');
    });

    test('prefers the unpooled URL for maintenance and falls back to runtime', () => {
        expect(resolveDatabaseUrl({ DATABASE_URL: 'runtime', DATABASE_URL_UNPOOLED: 'direct' }, 'maintenance')).toBe(
            'direct',
        );
        expect(resolveDatabaseUrl({ DATABASE_URL: 'runtime' }, 'maintenance')).toBe('runtime');
    });

    test('reports only missing variable names', () => {
        expect(() => resolveDatabaseUrl({})).toThrow('DATABASE_URL is required.');
        expect(() => resolveDatabaseUrl({}, 'maintenance')).toThrow(
            'DATABASE_URL_UNPOOLED or DATABASE_URL is required.',
        );
    });

    test('resolves callback values lazily', () => {
        const resolver = vi.fn(() => 'resolved');
        expect(resolver).not.toHaveBeenCalled();
        expect(resolveDatabaseUrlValue(resolver)).toBe('resolved');
        expect(resolver).toHaveBeenCalledOnce();
    });
});
