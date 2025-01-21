import React from 'react';
import cx from 'classnames';
import classes from './fullpage.module.css';

export const Fullpage = ({ divRef = null, className = '', children, ...props }) => (
    <div ref={divRef} className={cx(classes.container, className)} {...props}>
        {children}
    </div>
);