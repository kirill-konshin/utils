'use client';

import Link from 'next/link';
import React, { memo, ReactNode, useCallback } from 'react';
import { LinkProps } from 'next/link';

export type SoftLinkProps = LinkProps & {
    children?: ReactNode;
};

/**
 * Search Params update w/o rerender
 *
 * https://nextjs.org/docs/app/api-reference/functions/use-search-params#prerendering
 * https://github.com/vercel/next.js/issues/43691#issuecomment-2078921491
 * https://nextjs.org/docs/app/building-your-application/routing/linking-and-navigating#using-the-native-history-api
 */
export const SoftLink = memo<SoftLinkProps>(function SoftLink({ href, children, replace, ...props }) {
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
