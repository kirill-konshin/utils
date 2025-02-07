'use client';

import React from 'react';
import { Alert, AlertProps, Button, ButtonProps } from 'react-bootstrap';

//TODO Create MUI-specific?
export function ErrorAlert({
    onRetry,
    children,
    buttonProps,
    ...props
}: {
    children?: Error | string | any;
    onRetry?: () => any;
    buttonProps?: ButtonProps;
}) {
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
}
