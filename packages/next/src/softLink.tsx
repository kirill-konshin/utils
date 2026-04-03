'use client';

import Link from 'next/link';
import React, { memo, ReactNode, useCallback } from 'react';
import { LinkProps } from 'next/dist/client/link';

export type SoftLinkProps = LinkProps & {
    children?: ReactNode;
};

/**
 * Hash-based navigation on top of Next.js router
 *
 * FIXME Do not perform normal navigation
 *  https://github.com/vercel/next.js/issues/43691#issuecomment-2078921491
 *  https://nextjs.org/docs/app/building-your-application/routing/linking-and-navigating#using-the-native-history-api
 */
export const SoftLink = memo(function SoftLink({ href, children, replace, ...props }: SoftLinkProps) {
    const onClick = useCallback(
        (e) => {
            e.preventDefault();
            window.history[replace ? 'replaceState' : 'pushState'](
                null,
                '',
                typeof href === 'string'
                    ? href
                    : `${href['pathname'] || ''}?${typeof href['query'] === 'string' ? href['query'] : new URLSearchParams(href['query'] as never).toString()}`,
            );
        },
        [href, replace],
    );

    return (
        <Link href={href} {...props} onClick={onClick}>
            {children}
        </Link>
    );
}) as typeof Link;
