'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { LinkProps } from 'next/link';

export default function Redirect({ to, replace }: { to: LinkProps['href']; replace?: LinkProps['replace'] }) {
    const router = useRouter();
    useEffect(() => {
        router[replace ? 'replace' : 'push'](to.toString()); //TODO Test this
    }, [replace, router, to]);
    return null;
}
