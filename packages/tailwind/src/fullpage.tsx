import React, { FC, memo, RefObject } from 'react';

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
            className={`container h-screen flex flex-col justify-center items-center ${className}`}
        >
            {children}
        </div>
    );
});
