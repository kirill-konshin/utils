'use client';

import React, { ComponentProps, FC, memo } from 'react';
import { usePathname } from 'next/navigation';
import Link, { LinkProps } from 'next/link';
import clsx from 'clsx';

export type AppLinkProps = {
    children: any;
    exact?: boolean;
    activeClassName?: any;
} & LinkProps &
    ComponentProps<typeof Link>;

export function useIsLinkActive() {
    const pathname = usePathname();
    return (href: ComponentProps<typeof Link>['href'], exact: boolean): boolean => {
        const hrefPath = typeof href === 'string' ? href : href.pathname || '/';
        return (!exact && pathname.startsWith(hrefPath)) || (exact && pathname === hrefPath);
    };
}

//TODO Test this
export const AppLink: FC<AppLinkProps> = memo(function AppLink({
    href,
    children,
    className = '',
    activeClassName = '',
    prefetch = false, // set explicit default
    exact = false,
    ...props
}) {
    const isActive = useIsLinkActive();

    return (
        <Link
            {...props}
            href={href}
            className={clsx(className, {
                [activeClassName]: isActive(href, exact),
            })}
            prefetch={prefetch}
        >
            {children}
        </Link>
    );
});
