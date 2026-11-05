import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

import { MIN_SECRET_LENGTH, type SessionStrategy } from '../auth';
import { AUTHENTICATED } from '../client';

export type PasswordSession = { [AUTHENTICATED]?: boolean };

export type IronStrategyConfig<T extends object> = {
    /** MUST be unique per app, e.g. `myapp_session`, never a generic `session` */
    cookieName: string;
    /**
     * Decides whether a session counts as authenticated. Defaults to checking the lib-owned
     * `AUTHENTICATED` marker field (set by `createPasswordAuth`'s `login`, nothing to configure) —
     * pass your own for token/OAuth or custom shapes (e.g. access token present and not expired)
     */
    isValid?: (session: T) => boolean;
    /** Cookie sealing secret, min 32 chars, defaults to `process.env.SESSION_SECRET`, NOT the login password */
    secret?: string;
    /** Session lifetime in SECONDS, default 7 days; cookie `maxAge` is derived from it by iron-session, never set it */
    ttl?: number;
    /** Merged over secure defaults: `httpOnly`, `sameSite=lax`, `path=/`, `secure` in production */
    cookieOptions?: SessionOptions['cookieOptions'];
};

/** A session the app writes itself into a sealed cookie */
export type IronStrategy<T extends object> = SessionStrategy<T> & {
    isValid: (session: T) => boolean;
    getSessionOptions: () => SessionOptions;
    /** Merges data into the sealed session and saves it */
    setSession: (data: Partial<T>) => Promise<void>;
};

const DEFAULT_TTL = 60 * 60 * 24 * 7; // seconds, 7 days

// A boolean flag inside the sealed cookie, under the lib-owned AUTHENTICATED key
const defaultIsValid = (session: PasswordSession): boolean => session[AUTHENTICATED] === true;

export function ironStrategy<T extends object = PasswordSession>(config: IronStrategyConfig<T>): IronStrategy<T> {
    const { cookieName, isValid = defaultIsValid as unknown as (session: T) => boolean } = config;

    const resolveSecret = (): string => {
        const secret = config.secret ?? process.env.SESSION_SECRET;
        if (!secret || secret.length < MIN_SECRET_LENGTH) {
            throw new Error(
                `Session secret must be at least ${MIN_SECRET_LENGTH} characters, set SESSION_SECRET or pass "secret"`,
                { cause: { cookieName } },
            );
        }
        return secret;
    };

    const getSessionOptions = (): SessionOptions => ({
        cookieName,
        password: resolveSecret(),
        ttl: config.ttl ?? DEFAULT_TTL,
        cookieOptions: {
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            secure: process.env.NODE_ENV === 'production',
            ...config.cookieOptions,
        },
    });

    const openSession = async () => getIronSession<T>(await cookies(), getSessionOptions());

    return {
        name: 'iron',
        isValid,
        getSessionOptions,
        isConfigured: () => {
            try {
                resolveSecret();
                return true;
            } catch {
                return false;
            }
        },
        getSession: async () => {
            const session = await openSession();
            return isValid(session) ? session : null;
        },
        getRequestSession: async (request) => {
            // reading only: nothing is saved, so the response the session would write to is never sent
            const session = await getIronSession<T>(request, new Response(), getSessionOptions());
            return isValid(session) ? session : null;
        },
        setSession: async (data) => {
            const session = await openSession();
            Object.assign(session, data);
            await session.save();
        },
        destroySession: async () => (await openSession()).destroy(),
    };
}
