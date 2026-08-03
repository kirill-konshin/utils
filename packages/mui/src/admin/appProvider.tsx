'use client';

import React, { type ComponentProps, type FC, memo, useMemo } from 'react';

import { type Authentication, type Session } from '@toolpad/core/AppProvider';
import { NextAppProvider } from '@toolpad/core/nextjs';
import { useRouter } from 'next/navigation';

export type AdminAppProviderProps = ComponentProps<typeof NextAppProvider> & {
    /** Server action that destroys the session, wired into Toolpad `authentication.signOut` */
    logoutAction?: () => Promise<void>;
    /**
     * Login page (`auth.urls.login`) — Toolpad calls `authentication.signIn` from the account menu
     * when no session is present, and the sign-in UI is `AdminSignInPage` living there. Default `/login`
     */
    loginUrl?: string;
};

const DEFAULT_SESSION: Session = { user: { name: 'Admin' } };

/**
 * `NextAppProvider` preconfigured for password-protected admin apps: pass `logoutAction` (e.g.
 * `auth.logout` re-exported from a `'use server'` file) to get a sign-out button with a default
 * `Admin` session; `authentication`/`session` props still win when provided.
 */
export const AdminAppProvider: FC<AdminAppProviderProps> = memo(function AdminAppProvider({
    logoutAction,
    loginUrl = '/login',
    authentication,
    session,
    ...props
}) {
    const router = useRouter();

    const defaultAuthentication = useMemo<Authentication | undefined>(
        () =>
            logoutAction && {
                signIn: () => router.push(loginUrl), // the login page renders AdminSignInPage
                signOut: () => void logoutAction(),
            },
        [logoutAction, loginUrl, router],
    );

    return (
        <NextAppProvider
            authentication={authentication ?? defaultAuthentication}
            session={session ?? (logoutAction ? DEFAULT_SESSION : undefined)}
            {...props}
        />
    );
});
