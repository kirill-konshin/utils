'use client';

import React, { FC, JSX, useLayoutEffect, useState } from 'react';

/**
 * Prefer using Next.js `dynamic()` import with `ssr: false` because this will also remove import from server bundle.
 *
 * ```tsx
 * 'use client';
 *
 * import React from 'react';
 * import dynamic from 'next/dynamic';
 *
 * const PageClient = dynamic(() => import('./pageClient'), { ssr: false });
 *
 * export default function Page() {
 *   return (
 *     <PageClient />
 *   );
 * }
 * ```
 *
 * In other cases this component can be used to just prevent server rendering.
 *
 * @see https://github.com/kadirahq/react-no-ssr/blob/master/src/index.js
 * @see https://nextjs.org/docs/messages/react-hydration-error#solution-1-using-useeffect-to-run-on-the-client-only
 */
export const NoSSR: FC<{ children: any; onSSR?: JSX.Element }> = function NoSSR({ children, onSSR = null }): any {
    const [canRender, setCanRender] = useState(false);

    useLayoutEffect(() => {
        setCanRender(true);
    }, []);

    return canRender ? children : onSSR;
};
