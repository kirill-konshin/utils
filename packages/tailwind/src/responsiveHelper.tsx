'use client';

import React, { type FC, memo } from 'react';

export type ResponsiveHelperTWProps = Record<string, never>;

export const ResponsiveHelperTW: FC<ResponsiveHelperTWProps> = memo(function ResponsiveHelperTW() {
    return (
        <span className="fixed right-2 bottom-0 z-30 text-xs leading-none">
            <small className="hidden max-sm:block">XS</small>
            <small className="hidden sm:max-md:block">SM</small>
            <small className="hidden md:max-lg:block">MD</small>
            <small className="hidden lg:max-xl:block">LG</small>
            <small className="hidden xl:max-2xl:block">XL</small>
            <small className="hidden 2xl:block">XXL</small>
        </span>
    );
});
