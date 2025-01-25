import React from 'react';
import cx from 'classnames';

export const Fullpage = ({ divRef = null, className = '', children, ...props }) => (
    <div
        ref={divRef}
        className={cx('container h-screen flex flex-col justify-center items-center', className)}
        {...props}
    >
        {children}
    </div>
);
