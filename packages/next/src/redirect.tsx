'use client';

import { type FC, memo, useEffect } from 'react';

import type { LinkProps } from 'next/link';
import { useRouter } from 'next/navigation';

export type RedirectProps = {
    to: LinkProps['href'];
    replace?: LinkProps['replace'];
};

/**
 * @deprecated
 */
export const Redirect: FC<RedirectProps> = memo(function Redirect({ to, replace }) {
    const router = useRouter();
    useEffect(() => {
        router[replace ? 'replace' : 'push'](to.toString()); //TODO Test this
    }, [replace, router, to]);
    return null;
});
