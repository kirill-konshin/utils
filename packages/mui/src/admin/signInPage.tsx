'use client';

import React, { type FC, memo, useCallback } from 'react';

import { type PasswordAuth } from '@kirill.konshin/auth';
import type { STATE_PARAM as StateParam } from '@kirill.konshin/auth/client';

import { SignInPage, type SignInPageProps } from '../toolpad/signInPage';

export type AdminSignInPageProps = Omit<SignInPageProps, 'signIn'> & {
    /** `auth.loginFormAction` from `@kirill.konshin/auth`, re-exported from a `'use server'` file */
    loginAction: PasswordAuth['loginFormAction'];
    /** Pass `auth.isConfigured()` to render setup instructions instead of the form, default true */
    isConfigured?: boolean;
    /** Subtitle shown when not configured */
    notConfiguredSubtitle?: string;
    /** Sanitized return URL (`auth.getState(await searchParams)`), threaded into the login form */
    state?: string;
};

/*
 * Inlined, NOT imported at runtime: `@kirill.konshin/auth` is an OPTIONAL peer, so importing
 * `@kirill.konshin/auth/client` here would make the whole `/admin` entry unresolvable in apps that
 * only use `AdminAppProvider`/`AdminDashboardLayout` (the barrel re-exports this module). The
 * annotation is a compile-time guard: it stops resolving the day auth renames the param.
 */
const STATE_PARAM: typeof StateParam = 'state';

const DEFAULT_PROVIDERS: SignInPageProps['providers'] = [{ id: 'credentials', name: 'password' }];

const NOT_CONFIGURED_SUBTITLE = 'Set ADMIN_PASSWORD and a SESSION_SECRET of at least 32 characters, then restart.';

/**
 * `SignInPage` (the improved one of `../toolpad`) preconfigured for the password-only login of `@kirill.konshin/auth`:
 * single credentials provider, no email/rememberMe fields, errors surfaced through the form. On success `loginAction`
 * redirects (`SignInPage` keeps the form busy until the next page replaces it), on failure its message is shown.
 */
export const AdminSignInPage: FC<AdminSignInPageProps> = memo(function AdminSignInPage({
    loginAction,
    isConfigured = true,
    notConfiguredSubtitle = NOT_CONFIGURED_SUBTITLE,
    providers = DEFAULT_PROVIDERS,
    state,
    localeText,
    slots,
    slotProps,
    ...props
}) {
    const signIn = useCallback<NonNullable<SignInPageProps['signIn']>>(
        async (_provider, formData) => {
            if (!(formData instanceof FormData)) return { error: 'Password is required' };
            // thread the return URL through the form only — never store it in the session,
            // multiple tabs logging in concurrently would clash
            if (state) formData.set(STATE_PARAM, state);
            const error = await loginAction(null, formData);
            return error ? { error } : {};
        },
        [loginAction, state],
    );

    return (
        <SignInPage
            signIn={signIn}
            providers={isConfigured ? providers : []}
            localeText={
                isConfigured
                    ? localeText
                    : {
                          signInTitle: 'Authentication needs configuration',
                          signInSubtitle: notConfiguredSubtitle,
                          ...localeText,
                      }
            }
            slots={{
                emailField: () => null,
                rememberMe: () => null,
                subtitle: () => null,
                ...slots,
            }}
            slotProps={{
                ...slotProps,
                passwordField: { autoFocus: true, ...slotProps?.passwordField },
                submitButton: { variant: 'contained', ...slotProps?.submitButton },
            }}
            {...props}
        />
    );
});
