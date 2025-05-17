'use client';

import React, { useLayoutEffect, useState } from 'react';

const DefaultOnSSR = () => <span />;

// @see https://github.com/kadirahq/react-no-ssr/blob/master/src/index.js
// @see https://nextjs.org/docs/messages/react-hydration-error#solution-1-using-useeffect-to-run-on-the-client-only
export function NoSSR({ children, onSSR = <DefaultOnSSR /> }: { children: any; onSSR?: React.JSX.Element }): any {
    const [canRender, setCanRender] = useState(false);

    useLayoutEffect(() => {
        setCanRender(true);
    }, []);

    return canRender ? children : onSSR;
}
