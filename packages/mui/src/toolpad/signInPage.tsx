'use client';

import React, { type FC, memo, useCallback } from 'react';

import { formLabelClasses } from '@mui/material/FormLabel';
import { SignInPage as ToolpadSignInPage, type SignInPageProps } from '@toolpad/core/SignInPage';
import { unstable_rethrow } from 'next/navigation';

export type {
    AuthProvider,
    AuthResponse,
    SignInPageProps,
    SignInPageSlots,
    SupportedAuthProvider,
} from '@toolpad/core/SignInPage';

/** Whether Next.js handles `error` itself, like the redirect it rejects a redirecting Server Action call with. */
const isNextNavigation = (error: unknown): boolean => {
    try {
        unstable_rethrow(error);
        return false;
    } catch {
        return true;
    }
};

/**
 * Toolpad `SignInPage` with the same props, fixed:
 * - a `signIn` that redirects (a Server Action calling `redirect()`) keeps the form busy until the next page replaces
 *   it; Toolpad's submit handler has no catch, the redirect would be an unhandled rejection
 * - FIXME https://github.com/mui/toolpad/issues/4572: no browser validation popups fighting the server-side errors
 *   (`noValidate`), and the password label is no longer misaligned
 */
export const SignInPage: FC<SignInPageProps> = memo(function SignInPage({ signIn, slotProps, ...props }) {
    const handleSignIn = useCallback<NonNullable<SignInPageProps['signIn']>>(
        async (...args) => {
            try {
                // Toolpad reads only `?.error`: an empty response is the same as none
                return (await signIn!(...args)) ?? {};
            } catch (error) {
                if (isNextNavigation(error)) return new Promise<never>(() => {});
                throw error;
            }
        },
        [signIn],
    );

    const passwordSx = slotProps?.passwordField?.sx;

    return (
        <ToolpadSignInPage
            signIn={signIn && handleSignIn}
            slotProps={{
                ...slotProps,
                form: { noValidate: true, ...slotProps?.form },
                passwordField: {
                    ...slotProps?.passwordField,
                    // the documented way to merge `sx`: https://mui.com/system/getting-started/the-sx-prop/#passing-the-sx-prop
                    sx: [
                        { [`& .${formLabelClasses.root}`]: { top: '-2px' } },
                        ...(Array.isArray(passwordSx) ? passwordSx : [passwordSx]),
                    ],
                },
            }}
            {...props}
        />
    );
});
