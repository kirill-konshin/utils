import React, { type FC, memo, type RefObject } from 'react';

export type FullpageProps = {
    ref: RefObject<HTMLDivElement>;
    className?: string;
    children: any;
};

export const Fullpage: FC<FullpageProps> = memo(function Fullpage({ ref, className = '', children, ...props }) {
    return (
        <div
            ref={ref}
            {...props}
            className={`container flex h-screen flex-col items-center justify-center ${className}`}
        >
            {children}
        </div>
    );
});
