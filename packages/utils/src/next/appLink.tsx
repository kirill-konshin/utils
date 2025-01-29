'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Link, { LinkProps } from 'next/link';

export const AppLink = function AppLink({
    href,
    children,
    className = '',
    activeClassName = '',
    prefetch = false,
    exact = false,
    ...props
}: {
    href: string;
    children: any;
    className?: string;
    exact?: boolean;
    activeClassName?: string;
} & LinkProps<any>) {
    const pathname = usePathname();

    if ((!exact && pathname.startsWith(href)) || (exact && pathname === href)) {
        className = `${className} ${activeClassName}`;
    }

    return (
        <Link {...props} href={href} className={className} prefetch={prefetch}>
            {children}
        </Link>
    );
};
