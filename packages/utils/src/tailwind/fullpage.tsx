import React, { FC } from 'react';

export const Fullpage: FC<any> = ({ divRef = null, className = '', children, ...props }) => (
    <div
        ref={divRef}
        {...props}
        className={`container h-screen flex flex-col justify-center items-center ${className}`}
    >
        {children}
    </div>
);
