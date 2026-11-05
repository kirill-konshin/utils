import { redirect } from 'next/navigation';

import { type Auth, type AuthUrls, createAuth, timingSafeEqualStrings, withParams } from '../auth';
import { AUTHENTICATED, ERROR_PARAM, STATE_PARAM } from '../client';
import { type IronStrategy, type IronStrategyConfig, ironStrategy, type PasswordSession } from './iron';

export type PasswordAuthConfig<R extends string = string> = Omit<IronStrategyConfig<PasswordSession>, 'isValid'> & {
    /** Login password, defaults to `process.env.ADMIN_PASSWORD`, NOT the cookie secret */
    password?: string;
    // NoInfer: without it TS would narrow R to the literal urls passed here, breaking deeper paths
    urls?: AuthUrls<NoInfer<R>>;
    /** Called by `throwNonAuthenticated` before throwing, e.g. `unauthorized` from `next/navigation` */
    onUnauthorized?: () => never;
};

export type PasswordAuth<R extends string = string> = Auth<PasswordSession, R> & {
    strategy: IronStrategy<PasswordSession>;
    /** Timing-safe, never compare passwords with `===` */
    verifyPassword: (candidate: unknown) => boolean;
    /** Verifies the password and marks the session logged in */
    login: (candidate: unknown) => Promise<boolean>;
    /**
     * Plain `<form action>` for a Server-Component-only login page (the recommended pattern):
     * expects `password` (and optional `state` return URL) form fields; on failure redirects back
     * to `urls.login` with `?error=` (+ `state`), on success to `state` or `urls.afterLogin`.
     * Expose through a function-level `'use server'` wrapper in the auth module (see README)
     */
    loginAction: (formData: FormData) => Promise<void>;
    /**
     * `useActionState` variant returning the error message instead of redirecting on failure — only
     * for client components that need pending/error UI (or Toolpad `SignInPage`). Same wrapper rule
     */
    loginFormAction: (prevState: string | null | undefined, formData: FormData) => Promise<string>;
};

/** A password-protected app (admin dashboards, single-user tools) on an iron session */
export function createPasswordAuth<R extends string = string>(config: PasswordAuthConfig<R>): PasswordAuth<R> {
    const { password: configuredPassword, urls, onUnauthorized, ...ironConfig } = config;
    const strategy = ironStrategy<PasswordSession>(ironConfig);
    const auth = createAuth<PasswordSession, R>({ strategy, urls, onUnauthorized });

    const resolvePassword = (): string | undefined => configuredPassword ?? process.env.ADMIN_PASSWORD;

    const verifyPassword = (candidate: unknown): boolean => {
        const password = resolvePassword();
        if (typeof candidate !== 'string' || !candidate || !password) return false;
        return timingSafeEqualStrings(candidate, password);
    };

    const login = async (candidate: unknown): Promise<boolean> => {
        if (!verifyPassword(candidate)) return false;
        // fresh session: stale fields from previous session shapes (or another login) never linger
        await strategy.destroySession();
        await strategy.setSession({ [AUTHENTICATED]: true });
        return true;
    };

    const isConfigured = (): boolean => strategy.isConfigured() && Boolean(resolvePassword());

    // returns the error message, redirects away on success
    const submitLogin = async (formData: FormData): Promise<string> => {
        if (!isConfigured()) return 'Authentication is not configured';
        if (!(await login(formData.get('password')))) return 'Invalid password';
        redirect(auth.getState(formData));
    };

    return {
        ...auth,
        strategy,
        isConfigured,
        verifyPassword,
        login,
        loginAction: async (formData) => {
            const error = await submitLogin(formData);
            // back to the login page, error and return URL threaded via search params only; the
            // state param is dropped when it adds nothing over the afterLogin default
            const state = auth.getState(formData);
            redirect(
                withParams(auth.urls.login, {
                    [ERROR_PARAM]: error,
                    [STATE_PARAM]: state === auth.urls.afterLogin ? undefined : state,
                }),
            );
        },
        loginFormAction: async (_prevState, formData) => submitLogin(formData),
    };
}
