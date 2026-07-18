'use client';

import Link from 'next/link';
import React, { memo, type MouseEvent, type MouseEventHandler, type ReactNode, useCallback } from 'react';
import { type LinkProps } from 'next/link';

export type SoftLinkProps = LinkProps & {
    children?: ReactNode;
    onClick?: MouseEventHandler<HTMLAnchorElement>;
};

/**
 * Search Params update w/o rerender
 *
 * https://nextjs.org/docs/app/api-reference/functions/use-search-params#prerendering
 * https://github.com/vercel/next.js/issues/43691#issuecomment-2078921491
 * https://nextjs.org/docs/app/building-your-application/routing/linking-and-navigating#using-the-native-history-api
 */
export const SoftLink = memo<SoftLinkProps>(function SoftLink({ href, children, replace, onClick, ...props }) {
    const handleClick = useCallback(
        (e: MouseEvent<HTMLAnchorElement>) => {
            onClick?.(e);
            if (e.defaultPrevented) return;
            // new-tab/new-window/modified clicks stay with the browser (next/link defers them too)
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            e.preventDefault();
            window.history[replace ? 'replaceState' : 'pushState'](
                null,
                '',
                typeof href === 'string'
                    ? href
                    : `${href['pathname'] || ''}?${typeof href['query'] === 'string' ? href['query'] : new URLSearchParams(href['query'] as never).toString()}`,
            );
        },
        [href, replace, onClick],
    );

    return (
        <Link href={href} {...props} onClick={handleClick}>
            {children}
        </Link>
    );
}) as typeof Link;
