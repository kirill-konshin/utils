'use client';

import React, { ComponentProps, FC } from 'react';
import { usePathname } from 'next/navigation';
import Link, { LinkProps } from 'next/link';
import clsx from 'clsx';

//TODO Test this
export const AppLink: FC<
    {
        children: any;
        exact?: boolean;
        activeClassName?: any;
    } & LinkProps &
        ComponentProps<typeof Link>
> = function AppLink({
    href,
    children,
    className = '',
    activeClassName = '',
    prefetch = false, // set explicit default
    exact = false,
    ...props
}) {
    const pathname = usePathname();
    const hrefPath = typeof href === 'string' ? href : href.pathname || '/';

    return (
        <Link
            {...props}
            href={href}
            className={clsx(className, {
                [activeClassName]: (!exact && pathname.startsWith(hrefPath)) || (exact && pathname === hrefPath),
            })}
            prefetch={prefetch}
        >
            {children}
        </Link>
    );
};
