import { revalidateTag, unstable_cache } from 'next/cache';
import type { NextRequest, NextResponse } from 'next/server';

import type { ProxyStep, SessionStrategy } from '../auth';

/** What the strategy reads of Neon Auth's session: the `data` of `createNeonAuth(...).getSession()` */
export type NeonSession = {
    session: { id: string; userId: string; expiresAt: Date | string };
    user: { id: string; email: string; name?: string | null; image?: string | null; emailVerified?: boolean };
};

/**
 * The parts of the app's `createNeonAuth(...)` instance the strategy calls. The app creates that instance (and with
 * it Neon's own `cookies.sessionDataTtl` cache), so this package never imports `@neondatabase/auth`
 */
export type NeonAuthInstance = {
    getSession: () => Promise<{ data: NeonSession | null; error?: unknown }>;
    signOut: () => Promise<{ error?: unknown }>;
    middleware: (config?: { loginUrl?: string }) => (request: NextRequest) => Promise<NextResponse>;
};

export type NeonStrategyConfig<T extends object> = {
    neonAuth: NeonAuthInstance;
    /**
     * Turns Neon's session into the app's, e.g. its user and workspace looked up by `user.id`; `null` refuses the
     * session (unknown or not allowed user)
     */
    resolve: (session: NeonSession) => Promise<T | null>;
    /**
     * Seconds to cache `resolve` per Neon session in Next's data cache, so frequent requests do not repeat the
     * lookup; `0` (default) turns caching off. `destroySession` and `forgetSession` drop the cached entry. Its result
     * must be JSON-serializable
     */
    authCacheTtl?: number;
    /** Distinguishes cache entries when one app has several Neon strategies, default `neon` */
    cacheKey?: string;
};

export type NeonStrategy<T extends object> = SessionStrategy<T> & {
    /**
     * Drops the current Neon session's cached `resolve` result, e.g. right after the sign-in callback linked its
     * identity, so the next read looks it up again instead of reusing an earlier `null`; a no-op without
     * `authCacheTtl`. Server Actions and Route Handlers only, as `revalidateTag` requires
     */
    forgetSession: () => Promise<void>;
};

const sessionTag = (cacheKey: string, sessionId: string): string => `auth:${cacheKey}:${sessionId}`;

/**
 * Where Neon's middleware is told to send a request without a session. Nothing is served there: a redirect to it only
 * tells `proxyRequest` that there is no session, so `proxyGuard` decides with the app's own urls and return URL. Not
 * the real login page either, where Neon would skip refreshing the session that page reads
 */
const NO_SESSION_PATH = '/__auth/no-session';

/** Neon Auth's own session, turned into the app's by `resolve`; sign-in and sign-out go through Neon */
export function neonStrategy<T extends object>(config: NeonStrategyConfig<T>): NeonStrategy<T> {
    const { neonAuth, resolve, authCacheTtl = 0, cacheKey = 'neon' } = config;

    const readNeonSession = async (): Promise<NeonSession | null> => {
        const { data, error } = await neonAuth.getSession();
        if (error) console.error('[AUTH] Reading the Neon session failed', { error });
        return data?.session ? data : null;
    };

    const getSession = async (): Promise<T | null> => {
        const neonSession = await readNeonSession();
        if (!neonSession) return null;
        if (authCacheTtl <= 0) return resolve(neonSession);
        // `'use cache'` is not compiled inside a published package, so the data cache is reached through
        // `unstable_cache`, made per session so its tag can drop that session alone
        const { id } = neonSession.session;
        return unstable_cache(async () => resolve(neonSession), ['@kirill.konshin/auth', cacheKey, id], {
            revalidate: authCacheTtl,
            tags: [sessionTag(cacheKey, id)],
        })();
    };

    // Refreshes Neon's session cookie (from its own cache, upstream only when stale) and completes an OAuth sign-in
    const neonProxy = neonAuth.middleware({ loginUrl: NO_SESSION_PATH });

    const proxyRequest = async (request: NextRequest): Promise<ProxyStep> => {
        const response = await neonProxy(request);
        const location = response.headers.get('location');
        if (!location) return { isAuthenticated: true, next: response };
        if (new URL(location, request.url).pathname === NO_SESSION_PATH) return { isAuthenticated: false };
        return { send: response };
    };

    const forget = (neonSession: NeonSession | null): void => {
        if (neonSession) revalidateTag(sessionTag(cacheKey, neonSession.session.id), { expire: 0 });
    };

    return {
        name: 'neon',
        isConfigured: () => true,
        getSession,
        getRequestSession: getSession,
        // Server Components cannot write cookies, so Neon's session is refreshed in `proxy.ts`, before they read it
        proxyRequest,
        forgetSession: async () => {
            if (authCacheTtl > 0) forget(await readNeonSession());
        },
        destroySession: async () => {
            const neonSession = authCacheTtl > 0 ? await readNeonSession() : null;
            const { error } = await neonAuth.signOut();
            if (error) console.error('[AUTH] Neon sign-out failed', { error });
            forget(neonSession);
        },
    };
}
