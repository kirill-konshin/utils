import type * as NextServer from 'next/server';
import { beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { createAuth } from '../auth';
import { type NeonAuthInstance, type NeonSession, neonStrategy } from './neon';

const cache = vi.hoisted(() => ({
    revalidateTag: vi.fn(),
    // No data cache outside Next: the cached function runs every time, the call records how it would be cached
    unstable_cache: vi.fn((operation: () => Promise<unknown>) => operation),
}));
vi.mock('next/cache', () => cache);

vi.mock('next/headers', () => ({ headers: async () => ({ get: () => null }) }));

// Outside a Next.js request `connection()` throws for a missing request store; here every call is "the request".
vi.mock('next/server', async (importOriginal) => ({
    ...(await importOriginal<typeof NextServer>()),
    connection: async () => undefined,
}));

vi.mock('next/navigation', () => ({
    redirect: (url: string) => {
        throw new Error(`REDIRECT:${url}`);
    },
}));

type AppSession = { userId: string; workspaceId: string };

const NEON_SESSION: NeonSession = {
    session: { id: 'session-1', userId: 'neon-user-1', expiresAt: '2030-01-01T00:00:00.000Z' },
    user: { id: 'neon-user-1', email: 'traveller@example.com' },
};
const APP_SESSION: AppSession = { userId: 'user-1', workspaceId: 'workspace-1' };

const makeNeonAuth = (data: NeonSession | null = NEON_SESSION, error?: unknown) =>
    ({
        getSession: vi.fn(async () => ({ data, error })),
        signOut: vi.fn(async () => ({})),
    }) satisfies NeonAuthInstance;

beforeEach(() => {
    cache.unstable_cache.mockClear();
    cache.revalidateTag.mockReset();
});

describe('neonStrategy', () => {
    test("resolves the app's session from Neon's", async () => {
        const resolve = vi.fn(async () => APP_SESSION);
        const strategy = neonStrategy({ neonAuth: makeNeonAuth(), resolve });
        await expect(strategy.getSession()).resolves.toStrictEqual(APP_SESSION);
        expect(resolve).toHaveBeenCalledWith(NEON_SESSION);
    });

    test('answers null without a Neon session, or when resolve refuses it', async () => {
        const resolve = vi.fn(async () => APP_SESSION);
        await expect(neonStrategy({ neonAuth: makeNeonAuth(null), resolve }).getSession()).resolves.toBeNull();
        expect(resolve).not.toHaveBeenCalled();
        await expect(
            neonStrategy({ neonAuth: makeNeonAuth(), resolve: async () => null }).getSession(),
        ).resolves.toBeNull();
    });

    test('a failed Neon read is logged and counts as no session', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const strategy = neonStrategy({ neonAuth: makeNeonAuth(null, new Error('rate limited')), resolve: vi.fn() });
        await expect(strategy.getSession()).resolves.toBeNull();
        expect(error).toHaveBeenCalledWith(expect.stringContaining('Neon session'), expect.anything());
        error.mockRestore();
    });

    test('without authCacheTtl, resolve runs on every read and nothing is cached', async () => {
        const resolve = vi.fn(async () => APP_SESSION);
        const strategy = neonStrategy({ neonAuth: makeNeonAuth(), resolve });
        await strategy.getSession();
        await strategy.getSession();
        expect(resolve).toHaveBeenCalledTimes(2);
        expect(cache.unstable_cache).not.toHaveBeenCalled();
    });

    test('with authCacheTtl, resolve is cached that long per Neon session, tagged by it', async () => {
        const resolve = vi.fn(async () => APP_SESSION);
        const strategy = neonStrategy({ neonAuth: makeNeonAuth(), resolve, authCacheTtl: 60, cacheKey: 'cached' });
        await expect(strategy.getSession()).resolves.toStrictEqual(APP_SESSION);
        expect(cache.unstable_cache).toHaveBeenCalledWith(
            expect.any(Function),
            ['@kirill.konshin/auth', 'cached', 'session-1'],
            { revalidate: 60, tags: ['auth:cached:session-1'] },
        );
    });

    test('destroySession signs out of Neon and drops the cached session', async () => {
        const neonAuth = makeNeonAuth();
        const strategy = neonStrategy({ neonAuth, resolve: async () => APP_SESSION, authCacheTtl: 60 });
        await strategy.destroySession();
        expect(neonAuth.signOut).toHaveBeenCalledOnce();
        expect(cache.revalidateTag).toHaveBeenCalledWith('auth:neon:session-1', { expire: 0 });
    });

    test('forgetSession drops the cached session without signing out, and does nothing without a cache', async () => {
        const neonAuth = makeNeonAuth();
        await neonStrategy({ neonAuth, resolve: async () => APP_SESSION, authCacheTtl: 60 }).forgetSession();
        expect(cache.revalidateTag).toHaveBeenCalledWith('auth:neon:session-1', { expire: 0 });
        expect(neonAuth.signOut).not.toHaveBeenCalled();
        cache.revalidateTag.mockReset();
        await neonStrategy({ neonAuth, resolve: async () => APP_SESSION }).forgetSession();
        expect(cache.revalidateTag).not.toHaveBeenCalled();
    });

    test('destroySession without a cache only signs out', async () => {
        const neonAuth = makeNeonAuth();
        await neonStrategy({ neonAuth, resolve: async () => APP_SESSION }).destroySession();
        expect(neonAuth.signOut).toHaveBeenCalledOnce();
        expect(cache.revalidateTag).not.toHaveBeenCalled();
    });
});

describe('createAuth with neonStrategy', () => {
    test('guards answer from the resolved session', async () => {
        const auth = createAuth<AppSession>({
            strategy: neonStrategy({ neonAuth: makeNeonAuth(), resolve: async () => APP_SESSION }),
        });
        await expect(auth.throwNonAuthenticated()).resolves.toStrictEqual(APP_SESSION);
        await expect(auth.isAuthenticated()).resolves.toBe(true);
    });

    test('a request without a Neon session is sent to the login page', async () => {
        const auth = createAuth<AppSession>({
            strategy: neonStrategy({ neonAuth: makeNeonAuth(null), resolve: async () => APP_SESSION }),
            urls: { login: '/login', afterLogin: '/app' },
        });
        await expect(auth.redirectNonAuthenticated()).rejects.toThrow(/REDIRECT:\/login$/);
    });

    test('logout signs out of Neon and redirects', async () => {
        const neonAuth = makeNeonAuth();
        const auth = createAuth<AppSession>({ strategy: neonStrategy({ neonAuth, resolve: async () => APP_SESSION }) });
        await expect(auth.logout()).rejects.toThrow('REDIRECT:/login');
        expect(neonAuth.signOut).toHaveBeenCalledOnce();
    });
});
