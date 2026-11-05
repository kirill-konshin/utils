import { createHash, timingSafeEqual } from 'node:crypto';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection, type NextRequest, NextResponse } from 'next/server';
import picomatch from 'picomatch';

import { PATHNAME_HEADER, STATE_PARAM } from './client';

/** `R` is the route type — pass `Route` from `next` when `typedRoutes` is enabled */
export type AuthUrls<R extends string = string> = {
    /** Login page, default `/login` */
    login?: R;
    /** Where successful login lands when no `state` param is present, default `/` */
    afterLogin?: R;
    /** Where logout lands, default `urls.login` */
    afterLogout?: R;
    /** Path globs `proxyGuard` serves without a session, e.g. `['/api/tiles/**']` — patterns, not routes */
    public?: string[];
    /** Path globs `proxyGuard` requires a session for, e.g. `['/api/admin/**']` — patterns, not routes */
    protected?: string[];
};

/**
 * Where sessions live and how they are read: `ironStrategy` (`@kirill.konshin/auth/iron`, a sealed cookie the app
 * writes) or `neonStrategy` (`@kirill.konshin/auth/neon`, Neon Auth's own session). Every method answers for the
 * current request; `getSession` returns only an authenticated session, `null` otherwise
 */
export type SessionStrategy<T extends object> = {
    /** Strategy name, for errors and logs */
    name: string;
    /** Everything the strategy needs (secrets, instances) is present and usable, does not throw */
    isConfigured: () => boolean;
    /** The authenticated session of the current request, `null` without one */
    getSession: () => Promise<T | null>;
    /** The same for `proxy.ts`, which hands over the request */
    getRequestSession: (request: NextRequest) => Promise<T | null>;
    /** Ends the current session */
    destroySession: () => Promise<void>;
};

export type AuthConfig<T extends object, R extends string = string> = {
    strategy: SessionStrategy<T>;
    // NoInfer: without it TS would narrow R to the literal urls passed here, breaking deeper paths
    urls?: AuthUrls<NoInfer<R>>;
    /** Called by `throwNonAuthenticated` before throwing, e.g. `unauthorized` from `next/navigation` */
    onUnauthorized?: () => never;
};

export type ProxyGuardOptions = {
    /** Public requests that skip the auth check */
    allow?: (request: NextRequest) => boolean;
    /**
     * The literal `config.matcher` exported from `proxy.ts`. Validated at creation: it may be
     * broader than the `urls.public`/`urls.protected` globs, but every glob must be covered by it —
     * uncovered paths would bypass the proxy entirely, so a gap THROWS (config error)
     */
    matcher?: string | string[];
};

/**
 * App Router Route Handler shape — GET/POST/etc all share it (Next.js exports no public type for
 * route handlers, only the app-generated `RouteContext` global)
 */
export type RouteHandler<Context = { params: Promise<Record<string, string | string[] | undefined>> }> = (
    request: NextRequest,
    context: Context,
) => Response | Promise<Response>;

/** Resolved `AuthUrls` with all defaults applied */
export type ResolvedAuthUrls<R extends string = string> = {
    login: R;
    afterLogin: R;
    afterLogout: R;
    public: readonly string[];
    protected: readonly string[];
};

/** Anything the `state` return URL can be extracted from */
export type StateSource =
    | string
    | null
    | undefined
    | URLSearchParams
    | FormData
    | NextRequest
    | Record<string, string | string[] | undefined>;

export type Auth<T extends object, R extends string = string> = {
    /** Resolved URLs with defaults applied — reuse instead of literals, e.g. `redirect(auth.urls.afterLogin)` */
    urls: ResolvedAuthUrls<R>;
    /** The configured strategy, e.g. for iron's `setSession` */
    strategy: SessionStrategy<T>;
    /** The strategy is usable, does not throw */
    isConfigured: () => boolean;
    /** The authenticated session, `null` without one; request-time (`connection()`) */
    getSession: () => Promise<T | null>;
    /** For `proxy.ts`, which hands over the request */
    getRequestSession: (request: NextRequest) => Promise<T | null>;
    isAuthenticated: () => Promise<boolean>;
    /** For Server Actions and Route Handlers: throws `Unauthorized` (or calls `onUnauthorized`) */
    throwNonAuthenticated: () => Promise<T>;
    /**
     * For layouts and pages: redirects to `urls.login`, preserving `state` in the URL.
     * Without it the current pathname is recovered from the `x-pathname` header (stamped by
     * `proxyGuard` when its matcher covers page routes), falling back to `urls.afterLogin` where
     * login lands anyway
     */
    redirectNonAuthenticated: (state?: R) => Promise<T>;
    /** For the login page: redirects away when already authenticated */
    redirectIfAuthenticated: (redirectTo?: R) => Promise<void>;
    /**
     * Extracts and sanitizes the `state` return URL from `await searchParams`, `URLSearchParams`,
     * `FormData`, a `NextRequest` or a raw value: internal paths only (no open redirects), never
     * the login page itself (no redirect loops); falls back to `urls.afterLogin` when absent or
     * unsafe, so the result is always a usable target
     */
    getState: (source?: StateSource) => R;
    destroySession: () => Promise<void>;
    /**
     * Ends the session and redirects to `redirectTo ?? urls.afterLogout ?? urls.login`. Usable
     * directly as a `<form action>` — a `FormData` argument is ignored. Expose through a
     * function-level `'use server'` wrapper in the auth module (see README): action registration
     * must happen in app code, a plain re-export is not registered
     */
    logout: (redirectTo?: R | FormData) => Promise<void>;
    /** Wraps a Route Handler (any method — GET/POST/etc share one shape), responds `401` JSON when not authenticated */
    authenticatedRouteHandler: <Context = { params: Promise<Record<string, string | string[] | undefined>> }>(
        handler: RouteHandler<Context>,
    ) => RouteHandler<Context>;
    /**
     * The `proxy.ts` handler: `export const config = { matcher: [...] };` (a LITERAL — Next.js
     * parses it statically) then `export const proxy = auth.proxyGuard({ matcher: config.matcher });`.
     * The handler classifies requests by `urls.public` / `urls.protected` globs: public passes
     * without a session, protected responds `503` when unconfigured and `401` JSON when not
     * authenticated, a path matching BOTH glob sets throws (config error), a path matching NEITHER
     * logs a warning and passes as public. Without any globs everything is protected. `allow` is an
     * extra request-level bypass checked first. The supplied `matcher` is verified to cover all
     * globs (it may be broader) — an uncovered glob throws at creation (config error)
     */
    proxyGuard: (options?: ProxyGuardOptions) => (request: NextRequest) => Promise<NextResponse>;
};

export const MIN_SECRET_LENGTH = 32;

const sha256 = (value: string): Buffer => createHash('sha256').update(value).digest();

/** Constant-time string comparison via SHA-256 digests, safe for values of different lengths */
export const timingSafeEqualStrings = (a: string, b: string): boolean => timingSafeEqual(sha256(a), sha256(b));

export const withParams = (url: string, params: Record<string, string | undefined>): string => {
    const entries = Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]));
    if (!entries.length) return url;
    return `${url}${url.includes('?') ? '&' : '?'}${new URLSearchParams(entries)}`;
};

const withState = (url: string, state?: string): string => withParams(url, { [STATE_PARAM]: state });

// path-to-regexp matcher entry → equivalent globs, for verifying matcher coverage of urls globs
const matcherToGlobs = (entry: string): string[] => {
    if (entry.endsWith('/:path*')) {
        const prefix = entry.slice(0, -'/:path*'.length);
        return [prefix || '/', `${prefix}/**`];
    }
    return [entry.replace(/:\w+\*/g, '**').replace(/:\w+/g, '*')];
};

// `/x/**` should behave like Next's `/x/:path*`, which also matches the bare `/x` (for the root
// glob `/**` the bare prefix is `/`)
const expandPrefix = (glob: string): string[] => (glob.endsWith('/**') ? [glob, glob.slice(0, -3) || '/'] : [glob]);

export function createAuth<T extends object, R extends string = string>(config: AuthConfig<T, R>): Auth<T, R> {
    const { strategy, urls = {} } = config;
    const loginUrl: R = urls.login ?? ('/login' as R);

    const resolvedUrls: ResolvedAuthUrls<R> = {
        login: loginUrl,
        afterLogin: urls.afterLogin ?? ('/' as R),
        afterLogout: urls.afterLogout ?? loginUrl,
        public: urls.public ?? [],
        protected: urls.protected ?? [],
    };

    // redirectIfAuthenticated(afterLogin) on the login page would otherwise redirect to itself forever
    if (loginUrl !== '/' && resolvedUrls.afterLogin.startsWith(loginUrl)) {
        throw new Error('urls.afterLogin must not point at the login page, this would cause a redirect loop', {
            cause: { strategy: strategy.name, ...urls },
        });
    }

    const isPublicPath = urls.public?.length ? picomatch(urls.public.flatMap(expandPrefix)) : undefined;
    const isProtectedPath = urls.protected?.length ? picomatch(urls.protected.flatMap(expandPrefix)) : undefined;

    // Reading a session checks expiry with `Date.now()`, which Next.js rejects while prerendering (Partial Prefetching
    // prerenders link prefetches with cookies); `connection()` holds the session read until request time.
    const getSession = async (): Promise<T | null> => {
        await connection();
        return strategy.getSession();
    };

    const isAuthenticated = async (): Promise<boolean> => Boolean(await getSession());

    const getState = (source?: StateSource): R => {
        let value: unknown = source;
        if (source instanceof URLSearchParams || source instanceof FormData) value = source.get(STATE_PARAM);
        else if (source && typeof source === 'object') {
            value =
                'nextUrl' in source
                    ? (source as NextRequest).nextUrl.searchParams.get(STATE_PARAM)
                    : (source as Record<string, string | string[] | undefined>)[STATE_PARAM];
        }
        if (Array.isArray(value)) value = value[0];
        if (typeof value !== 'string' || !value) return resolvedUrls.afterLogin;
        if (!value.startsWith('/') || value.startsWith('//')) return resolvedUrls.afterLogin; // internal paths only
        if (value.startsWith(loginUrl)) return resolvedUrls.afterLogin; // never back to the login page
        return value as R;
    };

    return {
        urls: resolvedUrls,
        strategy,
        isConfigured: strategy.isConfigured,
        getSession,
        getRequestSession: strategy.getRequestSession,
        isAuthenticated,
        throwNonAuthenticated: async () => {
            const session = await getSession();
            if (!session) {
                config.onUnauthorized?.();
                throw new Error('Unauthorized');
            }
            return session;
        },
        redirectNonAuthenticated: async (state) => {
            const session = await getSession();
            if (!session) {
                // explicit state > pathname stamped by proxyGuard > afterLogin; getState maps
                // unsafe values (the header is spoofable when no proxy overwrites it) to afterLogin,
                // where login lands anyway, so the state param is dropped
                const target = getState(state ?? (await headers()).get(PATHNAME_HEADER));
                redirect(withState(loginUrl, target === resolvedUrls.afterLogin ? undefined : target));
            }
            return session;
        },
        redirectIfAuthenticated: async (redirectTo) => {
            if (await getSession()) redirect(redirectTo ?? resolvedUrls.afterLogin);
        },
        getState,
        destroySession: strategy.destroySession,
        logout: async (redirectTo) => {
            await strategy.destroySession();
            redirect((typeof redirectTo === 'string' ? redirectTo : undefined) ?? resolvedUrls.afterLogout);
        },
        authenticatedRouteHandler: (handler) => async (request, context) => {
            if (!(await isAuthenticated())) return Response.json({ error: 'Unauthorized' }, { status: 401 });
            return handler(request, context);
        },
        proxyGuard: ({ allow, matcher }: ProxyGuardOptions = {}) => {
            if (matcher) {
                // every public/protected glob must be covered by the supplied matcher (which may be
                // broader) — paths outside it never reach the proxy at all, so this is a config error
                const coveredBy = picomatch([matcher].flat().flatMap(matcherToGlobs));
                const uncovered = [...resolvedUrls.public, ...resolvedUrls.protected].filter(
                    (glob) => !expandPrefix(glob).every((probe) => coveredBy(probe.replace('/**', '/probe'))),
                );
                if (uncovered.length) {
                    throw new Error('proxyGuard matcher does not cover all urls globs, these paths would bypass it', {
                        cause: { uncovered, matcher, strategy: strategy.name },
                    });
                }
            }

            return async (request: NextRequest): Promise<NextResponse> => {
                const { pathname } = request.nextUrl;

                // stamp the pathname so redirectNonAuthenticated can recover it in layouts
                const requestHeaders = new Headers(request.headers);
                requestHeaders.set(PATHNAME_HEADER, pathname);
                const next = () => NextResponse.next({ request: { headers: requestHeaders } });

                if (allow?.(request)) return next();

                if (isPublicPath || isProtectedPath) {
                    const isPublic = isPublicPath?.(pathname) ?? false;
                    const isProtected = isProtectedPath?.(pathname) ?? false;

                    if (isPublic && isProtected) {
                        throw new Error('Path matches both urls.public and urls.protected globs', {
                            cause: { pathname, public: urls.public, protected: urls.protected },
                        });
                    }
                    if (isPublic) return next();
                    if (!isProtected) {
                        console.warn('[AUTH] proxyGuard unknown path, treating as public', {
                            pathname,
                            strategy: strategy.name,
                        });
                        return next();
                    }
                }
                // protected path, or no globs configured at all — everything requires a session

                if (!strategy.isConfigured()) {
                    return NextResponse.json({ error: 'Authentication is not configured' }, { status: 503 });
                }
                if (await strategy.getRequestSession(request)) return next();
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            };
        },
    };
}
