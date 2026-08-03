import { beforeEach, describe, expect, test, vi } from 'vitest';

import { createAuth, createPasswordAuth, MIN_SECRET_LENGTH, timingSafeEqualStrings } from './auth';
import { AUTHENTICATED, ERROR_PARAM, PATHNAME_HEADER, STATE_PARAM } from './client';

const SECRET = 'x'.repeat(MIN_SECRET_LENGTH);
const PASSWORD = 'correct horse battery staple';
const COOKIE_NAME = 'test_session';

const cookieJar = new Map<string, string>();
const headerJar = new Map<string, string>();

vi.mock('next/headers', () => ({
    cookies: async () => ({
        get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
        set: (name: string | { name: string; value: string }, value?: string) => {
            if (typeof name === 'string') cookieJar.set(name, value ?? '');
            else cookieJar.set(name.name, name.value);
        },
    }),
    headers: async () => ({
        get: (name: string) => headerJar.get(name) ?? null,
    }),
}));

vi.mock('next/navigation', () => ({
    redirect: (url: string) => {
        throw new Error(`REDIRECT:${url}`);
    },
}));

type TestSession = { userId?: string };

const makeAuth = (overrides: Partial<Parameters<typeof createAuth<TestSession>>[0]> = {}) =>
    createAuth<TestSession>({
        cookieName: COOKIE_NAME,
        secret: SECRET,
        isValid: (session) => Boolean(session.userId),
        ...overrides,
    });

const makePasswordAuth = (overrides: Partial<Parameters<typeof createPasswordAuth>[0]> = {}) =>
    createPasswordAuth({ cookieName: COOKIE_NAME, secret: SECRET, password: PASSWORD, ...overrides });

const makeFormData = (entries: Record<string, string>) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(entries)) formData.set(key, value);
    return formData;
};

beforeEach(() => {
    cookieJar.clear();
    headerJar.clear();
    vi.unstubAllEnvs();
    vi.stubEnv('SESSION_SECRET', '');
    vi.stubEnv('ADMIN_PASSWORD', '');
});

describe('timingSafeEqualStrings', () => {
    test('equal strings', () => expect(timingSafeEqualStrings('secret', 'secret')).toBe(true));
    test('different strings', () => expect(timingSafeEqualStrings('secret', 'guess')).toBe(false));
    test('different lengths do not throw', () => expect(timingSafeEqualStrings('a', 'longer')).toBe(false));
});

describe('createAuth', () => {
    test('getSession throws without secret', async () => {
        await expect(makeAuth({ secret: undefined }).getSession()).rejects.toThrow(/at least 32 characters/);
    });

    test('getSession throws on short secret', async () => {
        await expect(makeAuth({ secret: 'short' }).getSession()).rejects.toThrow(/at least 32 characters/);
    });

    test('falls back to SESSION_SECRET env', async () => {
        vi.stubEnv('SESSION_SECRET', SECRET);
        const auth = makeAuth({ secret: undefined });
        expect(auth.isConfigured()).toBe(true);
        await expect(auth.getSession()).resolves.toBeDefined();
    });

    test('isConfigured does not throw', () => {
        expect(makeAuth({ secret: undefined }).isConfigured()).toBe(false);
        expect(makeAuth().isConfigured()).toBe(true);
    });

    test('secure cookie defaults and ttl', () => {
        const options = makeAuth().getSessionOptions();
        expect(options.cookieName).toBe(COOKIE_NAME);
        expect(options.ttl).toBe(60 * 60 * 24 * 7);
        expect(options.cookieOptions).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', secure: false });
    });

    test('cookieOptions and ttl overrides', () => {
        const options = makeAuth({ ttl: 60, cookieOptions: { sameSite: 'strict' } }).getSessionOptions();
        expect(options.ttl).toBe(60);
        expect(options.cookieOptions?.sameSite).toBe('strict');
    });

    test('setSession round-trips data through the sealed cookie', async () => {
        const auth = makeAuth();
        await auth.setSession({ userId: '42' });
        expect(cookieJar.get(COOKIE_NAME)).toMatch(/^Fe26\./); // sealed iron format, not plaintext
        expect(cookieJar.get(COOKIE_NAME)).not.toContain('userId');
        expect((await auth.getSession()).userId).toBe('42');
    });

    test('isAuthenticated reflects isValid', async () => {
        const auth = makeAuth();
        expect(await auth.isAuthenticated()).toBe(false);
        await auth.setSession({ userId: '42' });
        expect(await auth.isAuthenticated()).toBe(true);
    });

    test('throwNonAuthenticated throws when not authenticated', async () => {
        await expect(makeAuth().throwNonAuthenticated()).rejects.toThrow('Unauthorized');
    });

    test('throwNonAuthenticated calls onUnauthorized', async () => {
        const onUnauthorized = vi.fn(() => {
            throw new Error('CUSTOM');
        });
        await expect(
            makeAuth({ onUnauthorized: onUnauthorized as () => never }).throwNonAuthenticated(),
        ).rejects.toThrow('CUSTOM');
        expect(onUnauthorized).toHaveBeenCalledOnce();
    });

    test('throwNonAuthenticated returns session when authenticated', async () => {
        const auth = makeAuth();
        await auth.setSession({ userId: '42' });
        expect((await auth.throwNonAuthenticated()).userId).toBe('42');
    });

    test('redirectNonAuthenticated redirects to login preserving return URL', async () => {
        await expect(makeAuth().redirectNonAuthenticated()).rejects.toThrow('REDIRECT:/login');
        await expect(
            makeAuth({ urls: { login: '/admin/login' } }).redirectNonAuthenticated('/app/deep'),
        ).rejects.toThrow(`REDIRECT:/admin/login?${STATE_PARAM}=${encodeURIComponent('/app/deep')}`);
    });

    test('redirectNonAuthenticated skips the state param when it equals the known afterLogin', async () => {
        const auth = makeAuth({ urls: { login: '/login', afterLogin: '/app' } });
        await expect(auth.redirectNonAuthenticated()).rejects.toThrow(/REDIRECT:\/login$/);
        await expect(auth.redirectNonAuthenticated('/app')).rejects.toThrow(/REDIRECT:\/login$/);
        await expect(auth.redirectNonAuthenticated('/app/deep')).rejects.toThrow(
            `REDIRECT:/login?${STATE_PARAM}=${encodeURIComponent('/app/deep')}`,
        );
    });

    test('redirectNonAuthenticated recovers the deep path from the x-pathname header', async () => {
        const auth = makeAuth({ urls: { login: '/login', afterLogin: '/app' } });

        headerJar.set(PATHNAME_HEADER, '/app/deep');
        await expect(auth.redirectNonAuthenticated()).rejects.toThrow(
            `REDIRECT:/login?${STATE_PARAM}=${encodeURIComponent('/app/deep')}`,
        );

        // explicit argument wins over the header
        await expect(auth.redirectNonAuthenticated('/other')).rejects.toThrow(
            `REDIRECT:/login?${STATE_PARAM}=${encodeURIComponent('/other')}`,
        );

        // header equal to afterLogin adds nothing — login lands there anyway
        headerJar.set(PATHNAME_HEADER, '/app');
        await expect(auth.redirectNonAuthenticated()).rejects.toThrow(/REDIRECT:\/login$/);

        // spoofed header (no proxy to overwrite it) is sanitized away
        headerJar.set(PATHNAME_HEADER, 'https://evil.example');
        await expect(auth.redirectNonAuthenticated()).rejects.toThrow(/REDIRECT:\/login$/);
    });

    test('throws when afterLogin points at the login page (redirect loop)', () => {
        expect(() => makeAuth({ urls: { login: '/login', afterLogin: '/login' } })).toThrow(/redirect loop/);
    });

    test('appends state with & when the login URL already has a query', async () => {
        await expect(makeAuth({ urls: { login: '/login?src=x' } }).redirectNonAuthenticated('/deep')).rejects.toThrow(
            `REDIRECT:/login?src=x&${STATE_PARAM}=${encodeURIComponent('/deep')}`,
        );
    });

    test('default isValid checks the lib-owned AUTHENTICATED marker', async () => {
        const auth = createAuth({ cookieName: COOKIE_NAME, secret: SECRET }); // no isValid, T = PasswordSession
        expect(await auth.isAuthenticated()).toBe(false);

        await auth.setSession({ [AUTHENTICATED]: true });
        expect(await auth.isAuthenticated()).toBe(true);

        await auth.setSession({ [AUTHENTICATED]: false });
        expect(await auth.isAuthenticated()).toBe(false);
    });

    test('accepts a typed routes union as the R generic', async () => {
        type Routes = '/login' | '/app' | '/app/deep';
        const auth = createAuth<TestSession, Routes>({
            cookieName: COOKIE_NAME,
            secret: SECRET,
            isValid: (session) => Boolean(session.userId),
            urls: { login: '/login', afterLogin: '/app' },
        });
        const state: Routes | undefined = auth.getState('/app/deep'); // typed, no cast needed
        expect(state).toBe('/app/deep');
        await expect(auth.redirectNonAuthenticated('/app/deep')).rejects.toThrow(
            `REDIRECT:/login?${STATE_PARAM}=${encodeURIComponent('/app/deep')}`,
        );
    });

    describe('getState', () => {
        const auth = makeAuth({ urls: { afterLogin: '/app' } });

        test('accepts raw string, searchParams record, URLSearchParams, FormData and NextRequest', () => {
            expect(auth.getState('/deep')).toBe('/deep');
            expect(auth.getState({ [STATE_PARAM]: '/deep' })).toBe('/deep');
            expect(auth.getState({ [STATE_PARAM]: ['/deep', '/other'] })).toBe('/deep');
            expect(auth.getState(new URLSearchParams({ [STATE_PARAM]: '/deep' }))).toBe('/deep');
            expect(auth.getState(makeFormData({ [STATE_PARAM]: '/deep' }))).toBe('/deep');
            const request = Object.assign(new Request(`http://localhost/refresh?${STATE_PARAM}=/deep`), {
                nextUrl: new URL(`http://localhost/refresh?${STATE_PARAM}=/deep`),
            });
            expect(auth.getState(request as never)).toBe('/deep');
        });

        test('falls back to afterLogin for missing and empty values', () => {
            expect(auth.getState()).toBe('/app');
            expect(auth.getState(null)).toBe('/app');
            expect(auth.getState('')).toBe('/app');
            expect(auth.getState({})).toBe('/app');
            expect(auth.getState(new URLSearchParams())).toBe('/app');
        });

        test('falls back to afterLogin for external and protocol-relative URLs', () => {
            expect(auth.getState('https://evil.example')).toBe('/app');
            expect(auth.getState('//evil.example')).toBe('/app');
        });

        test('falls back to afterLogin for the login page itself', () => {
            expect(auth.getState('/login')).toBe('/app');
            expect(auth.getState('/login?error=x')).toBe('/app');
            expect(makeAuth({ urls: { login: '/admin/login' } }).getState('/admin/login')).toBe('/');
            expect(makeAuth({ urls: { login: '/admin/login' } }).getState('/login')).toBe('/login');
        });
    });

    test('redirectIfAuthenticated redirects only when authenticated', async () => {
        const auth = makeAuth({ urls: { afterLogin: '/app' } });
        await expect(auth.redirectIfAuthenticated()).resolves.toBeUndefined();
        await auth.setSession({ userId: '42' });
        await expect(auth.redirectIfAuthenticated()).rejects.toThrow('REDIRECT:/app');
        await expect(auth.redirectIfAuthenticated('/deep')).rejects.toThrow('REDIRECT:/deep');
    });

    test('destroySession clears the session', async () => {
        const auth = makeAuth();
        await auth.setSession({ userId: '42' });
        await auth.destroySession();
        expect(await auth.isAuthenticated()).toBe(false);
    });

    test('logout destroys and redirects', async () => {
        const auth = makeAuth({ urls: { login: '/login', afterLogout: '/bye' } });
        await auth.setSession({ userId: '42' });
        await expect(auth.logout()).rejects.toThrow('REDIRECT:/bye');
        expect(await auth.isAuthenticated()).toBe(false);
        await expect(auth.logout('/custom')).rejects.toThrow('REDIRECT:/custom');
    });

    test('logout ignores a FormData argument (direct <form action> usage)', async () => {
        const auth = makeAuth({ urls: { login: '/login', afterLogout: '/bye' } });
        await auth.setSession({ userId: '42' });
        await expect(auth.logout(makeFormData({ anything: 'x' }))).rejects.toThrow('REDIRECT:/bye');
        expect(await auth.isAuthenticated()).toBe(false);
    });

    test('exposes resolved urls with defaults applied', () => {
        expect(makeAuth().urls).toEqual({
            login: '/login',
            afterLogin: '/',
            afterLogout: '/login',
            public: [],
            protected: [],
        });
        expect(makeAuth({ urls: { login: '/admin/login', afterLogin: '/app', public: ['/x/**'] } }).urls).toEqual({
            login: '/admin/login',
            afterLogin: '/app',
            afterLogout: '/admin/login',
            public: ['/x/**'],
            protected: [],
        });
    });

    test('authenticatedRouteHandler responds 401 when not authenticated', async () => {
        const handler = vi.fn(async () => Response.json({ ok: true }));
        const guarded = makeAuth().authenticatedRouteHandler(handler);
        const response = await guarded(new Request('http://localhost/api') as never, { params: Promise.resolve({}) });
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'Unauthorized' });
        expect(handler).not.toHaveBeenCalled();
    });

    test('authenticatedRouteHandler passes request and context through when authenticated', async () => {
        const auth = makeAuth();
        await auth.setSession({ userId: '42' });
        const guarded = auth.authenticatedRouteHandler(async (request, context) =>
            Response.json({ url: request.url, params: await context.params }),
        );
        const response = await guarded(new Request('http://localhost/api/x') as never, {
            params: Promise.resolve({ id: '1' }),
        });
        expect(await response.json()).toEqual({ url: 'http://localhost/api/x', params: { id: '1' } });
    });
});

describe('proxyGuard', () => {
    const makeRequest = (cookie?: string, url = 'http://localhost/api/data') =>
        Object.assign(new Request(url, { headers: cookie ? { cookie } : {} }), { nextUrl: new URL(url) }) as never;

    test('503 when not configured', async () => {
        const guard = makeAuth({ secret: undefined }).proxyGuard();
        expect((await guard(makeRequest())).status).toBe(503);
    });

    test('allow bypasses the auth check', async () => {
        const guard = makeAuth({ secret: undefined }).proxyGuard({ allow: () => true });
        expect((await guard(makeRequest())).status).toBe(200);
    });

    test('401 without a valid session', async () => {
        const response = await makeAuth().proxyGuard()(makeRequest());
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'Unauthorized' });
    });

    test('passes with a valid session cookie', async () => {
        const auth = makeAuth();
        await auth.setSession({ userId: '42' });
        const response = await auth.proxyGuard()(makeRequest(`${COOKIE_NAME}=${cookieJar.get(COOKIE_NAME)}`));
        expect(response.status).toBe(200);
    });

    describe('urls.public / urls.protected globs', () => {
        const makeGlobAuth = () => makeAuth({ urls: { public: ['/api/tiles/**'], protected: ['/api/admin/**'] } });

        test('public path passes without a session', async () => {
            const response = await makeGlobAuth().proxyGuard()(
                makeRequest(undefined, 'http://localhost/api/tiles/1/2/3'),
            );
            expect(response.status).toBe(200);
        });

        test('protected path requires a session', async () => {
            const auth = makeGlobAuth();
            const guard = auth.proxyGuard();
            expect((await guard(makeRequest(undefined, 'http://localhost/api/admin/cache'))).status).toBe(401);

            await auth.setSession({ userId: '42' });
            const cookie = `${COOKIE_NAME}=${cookieJar.get(COOKIE_NAME)}`;
            expect((await guard(makeRequest(cookie, 'http://localhost/api/admin/cache'))).status).toBe(200);
        });

        test('overlapping globs throw', async () => {
            const guard = makeAuth({
                urls: { public: ['/api/**'], protected: ['/api/admin/**'] },
            }).proxyGuard();
            await expect(guard(makeRequest(undefined, 'http://localhost/api/admin/cache'))).rejects.toThrow(
                /matches both/,
            );
        });

        test('unknown path warns and passes as public', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const response = await makeGlobAuth().proxyGuard()(makeRequest(undefined, 'http://localhost/api/other'));
            expect(response.status).toBe(200);
            expect(warn).toHaveBeenCalledWith(
                expect.stringContaining('unknown path'),
                expect.objectContaining({ pathname: '/api/other' }),
            );
            warn.mockRestore();
        });

        test('allow bypasses classification entirely', async () => {
            const guard = makeGlobAuth().proxyGuard({ allow: () => true });
            expect((await guard(makeRequest(undefined, 'http://localhost/api/admin/cache'))).status).toBe(200);
        });

        test('matcher option throws when it does not cover all globs', () => {
            expect(() => makeGlobAuth().proxyGuard({ matcher: ['/api/tiles/:path*'] })).toThrow(/does not cover/); // /api/admin/** missing
        });

        test('matcher option accepts an exact or broader matcher', () => {
            expect(() =>
                makeGlobAuth().proxyGuard({ matcher: ['/api/tiles/:path*', '/api/admin/:path*'] }),
            ).not.toThrow(); // exact
            expect(() => makeGlobAuth().proxyGuard({ matcher: '/api/:path*' })).not.toThrow(); // broader
            expect(() =>
                makeAuth({ urls: { public: ['/health'] } }).proxyGuard({ matcher: ['/health', '/other'] }),
            ).not.toThrow(); // literal
        });

        test("root glob '/**' covers everything including bare /", async () => {
            const proxy = makeAuth({ urls: { public: ['/**'] } }).proxyGuard({ matcher: '/:path*' });
            expect((await proxy(makeRequest(undefined, 'http://localhost/'))).status).toBe(200);
            expect((await proxy(makeRequest(undefined, 'http://localhost/anything/deep'))).status).toBe(200);
        });

        test('bare prefix of a /** glob is classified like the glob (matches /:path* semantics)', async () => {
            const proxy = makeGlobAuth().proxyGuard();
            expect((await proxy(makeRequest(undefined, 'http://localhost/api/admin'))).status).toBe(401);
            expect((await proxy(makeRequest(undefined, 'http://localhost/api/tiles'))).status).toBe(200);
        });

        test('stamps x-pathname onto forwarded requests for redirectNonAuthenticated', async () => {
            const response = await makeGlobAuth().proxyGuard()(makeRequest(undefined, 'http://localhost/api/tiles/1'));
            expect(response.headers.get(`x-middleware-request-${PATHNAME_HEADER}`)).toBe('/api/tiles/1');
        });
    });
});

describe('createPasswordAuth', () => {
    test('isConfigured requires both secret and password', () => {
        expect(makePasswordAuth().isConfigured()).toBe(true);
        expect(makePasswordAuth({ secret: undefined }).isConfigured()).toBe(false);
        expect(makePasswordAuth({ password: undefined }).isConfigured()).toBe(false);
    });

    test('falls back to ADMIN_PASSWORD env', () => {
        vi.stubEnv('ADMIN_PASSWORD', PASSWORD);
        expect(makePasswordAuth({ password: undefined }).verifyPassword(PASSWORD)).toBe(true);
    });

    test('verifyPassword', () => {
        const auth = makePasswordAuth();
        expect(auth.verifyPassword(PASSWORD)).toBe(true);
        expect(auth.verifyPassword('wrong')).toBe(false);
        expect(auth.verifyPassword('')).toBe(false);
        expect(auth.verifyPassword(null)).toBe(false);
        expect(auth.verifyPassword(42)).toBe(false);
    });

    test('login sets the session only on correct password', async () => {
        const auth = makePasswordAuth();
        expect(await auth.login('wrong')).toBe(false);
        expect(await auth.isAuthenticated()).toBe(false);
        expect(await auth.login(PASSWORD)).toBe(true);
        expect(await auth.isAuthenticated()).toBe(true);
    });

    test('login starts a fresh session, stale fields from older session shapes are dropped', async () => {
        const auth = makePasswordAuth();
        // simulate a cookie written by a previous app version with a different shape (e.g. isAdmin)
        await auth.setSession({ isAdmin: true } as never);
        expect(await auth.isAuthenticated()).toBe(false); // unseals fine, just not logged in

        expect(await auth.login(PASSWORD)).toBe(true);
        const session = await auth.getSession();
        expect(session[AUTHENTICATED]).toBe(true);
        expect(session).not.toHaveProperty('isAdmin');
    });

    test('loginAction (plain form action) redirects back to login with the error in search params', async () => {
        await expect(makePasswordAuth().loginAction(makeFormData({ password: 'wrong' }))).rejects.toThrow(
            `REDIRECT:/login?${ERROR_PARAM}=Invalid+password`,
        );
        await expect(
            makePasswordAuth().loginAction(makeFormData({ password: 'wrong', [STATE_PARAM]: '/deep' })),
        ).rejects.toThrow(`REDIRECT:/login?${ERROR_PARAM}=Invalid+password&${STATE_PARAM}=%2Fdeep`);
    });

    test('loginAction redirects to state or afterLogin on success', async () => {
        await expect(
            makePasswordAuth({ urls: { afterLogin: '/app' } }).loginAction(makeFormData({ password: PASSWORD })),
        ).rejects.toThrow('REDIRECT:/app');
        await expect(
            makePasswordAuth().loginAction(makeFormData({ password: PASSWORD, [STATE_PARAM]: '/deep' })),
        ).rejects.toThrow('REDIRECT:/deep');
    });

    test('loginFormAction returns error messages', async () => {
        expect(await makePasswordAuth({ secret: undefined }).loginFormAction(null, makeFormData({}))).toBe(
            'Authentication is not configured',
        );
        expect(await makePasswordAuth().loginFormAction(null, makeFormData({ password: 'wrong' }))).toBe(
            'Invalid password',
        );
    });

    test('loginFormAction redirects on success honoring the state param', async () => {
        await expect(makePasswordAuth().loginFormAction(null, makeFormData({ password: PASSWORD }))).rejects.toThrow(
            'REDIRECT:/',
        );
        await expect(
            makePasswordAuth({ urls: { afterLogin: '/app' } }).loginFormAction(
                null,
                makeFormData({ password: PASSWORD }),
            ),
        ).rejects.toThrow('REDIRECT:/app');
        await expect(
            makePasswordAuth().loginFormAction(null, makeFormData({ password: PASSWORD, [STATE_PARAM]: '/deep' })),
        ).rejects.toThrow('REDIRECT:/deep');
    });

    test('state survives end to end: guard writes it, login page restores it, form redirects to it', async () => {
        const auth = makePasswordAuth({ urls: { login: '/login', afterLogin: '/app' } });

        // 1. layout guard: unauthenticated visit to a deep page (proxy stamped x-pathname)
        headerJar.set(PATHNAME_HEADER, '/app/deep');
        const loginLocation = await auth
            .redirectNonAuthenticated()
            .then(() => '')
            .catch((error: Error) => error.message.replace('REDIRECT:', ''));

        // 2. login page: restores state from searchParams (never from the session — multitab safe)
        const state = auth.getState(new URL(`http://localhost${loginLocation}`).searchParams);
        expect(state).toBe('/app/deep');

        // 3. the form threads it as a hidden field, successful login redirects back to the deep page
        await expect(
            auth.loginFormAction(null, makeFormData({ password: PASSWORD, [STATE_PARAM]: state! })),
        ).rejects.toThrow('REDIRECT:/app/deep');

        // state is never persisted in the session (concurrent tabs would clash)
        const session = await auth.getSession();
        expect(session[AUTHENTICATED]).toBe(true);
        expect(session).not.toHaveProperty(STATE_PARAM);
    });

    test('loginFormAction ignores unsafe state values', async () => {
        await expect(
            makePasswordAuth().loginFormAction(
                null,
                makeFormData({ password: PASSWORD, [STATE_PARAM]: 'https://evil.example' }),
            ),
        ).rejects.toThrow('REDIRECT:/');
    });
});
