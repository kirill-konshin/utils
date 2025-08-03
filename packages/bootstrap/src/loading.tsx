import { Spinner, SpinnerProps, Stack } from 'react-bootstrap';
import React, { FC, memo } from 'react';

export type LoadingProps = {
    children?: any;
    show?: boolean;
    className?: string;
    size?: SpinnerProps['size'];
};

export const Loading: FC<LoadingProps> = memo(function Loading({
    children = 'Loading...' as any,
    show = true,
    className = '',
    size,
}) {
    if (!show) return null;
    return (
        <Stack direction="horizontal" gap={3} className={`align-self-auto ${className}`}>
            <Spinner animation="border" role="status" size={size as any} />
            <span>{children}</span>
        </Stack>
    );
});
