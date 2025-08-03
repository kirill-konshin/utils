'use client';

import React, { FC } from 'react';

export const ResponsiveHelperTW: FC<any> = function ResponsiveHelperTW() {
    return (
        <span className="fixed bottom-0 right-2 z-30 leading-none text-xs">
            <small className="hidden xs:max-sm:block">XS</small>
            <small className="hidden sm:max-md:block">SM</small>
            <small className="hidden md:max-lg:block">MD</small>
            <small className="hidden lg:max-xl:block">LG</small>
            <small className="hidden xl:max-2xl:block">XL</small>
            <small className="hidden 2xl:block">XXL</small>
        </span>
    );
};
