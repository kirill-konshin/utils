import React, { FC, RefObject } from 'react';

export const Fullpage: FC<{ ref: RefObject<HTMLDivElement>; className: string; children: any }> = ({
    ref,
    className = '',
    children,
    ...props
}) => (
    <div ref={ref} {...props} className={`container h-screen flex flex-col justify-center items-center ${className}`}>
        {children}
    </div>
);
