'use client';

import { type FC, memo, useEffect } from 'react';

import { formatUrl } from 'next/dist/shared/lib/router/utils/format-url';
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
        router[replace ? 'replace' : 'push'](typeof to === 'string' ? to : formatUrl(to)); //TODO Test this
    }, [replace, router, to]);
    return null;
});
