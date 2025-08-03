'use client';

import React, { FC } from 'react';
import { Alert, AlertProps, Button, ButtonProps } from 'react-bootstrap';

export type ErrorAlertProps = {
    children?: Error | string | any;
    onRetry?: () => any;
    buttonProps?: ButtonProps;
};

//TODO Create MUI-specific?
export const ErrorAlert: FC<ErrorAlertProps> = function ErrorAlert({ onRetry, children, buttonProps, ...props }) {
    if (!children) return null;

    return (
        <Alert variant="danger" {...props}>
            <div>{children.message || children.toString()}</div>
            {onRetry && (
                <div>
                    <Button
                        variant="link"
                        className="alert-link"
                        {...buttonProps}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onRetry();
                        }}
                    >
                        Retry
                    </Button>
                </div>
            )}
        </Alert>
    );
};
