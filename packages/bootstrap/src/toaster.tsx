'use client';

import React, { useState, FC } from 'react';
import { Toast, ToastProps } from 'react-bootstrap';
// import { useToaster } from '../redux/toasterSlice';

export type ToasterProps = {
    toast: string | { message: string; title?: string; variant?: 'dark' | 'success' | 'danger' };
} & ToastProps;

export const Toaster: FC<ToasterProps> = function Toaster({ toast }) {
    //const { toast, setToast } = useToaster();
    const [dismissed, setDismissed] = useState(false);

    const msg = typeof toast === 'string' ? toast : toast?.message;
    // const title = typeof toast === 'string' ? 'Notification' : toast?.title;
    const variant = typeof toast === 'string' ? '' : toast?.variant;

    return (
        <Toast
            onClose={() => setDismissed(true)}
            show={!dismissed}
            delay={10000}
            autohide
            bg={variant?.toLowerCase()}
            className="position-fixed top-50 right-50 min-w-200px z-3"
        >
            <Toast.Header>
                <strong className="me-auto">Notification</strong>
            </Toast.Header>
            <Toast.Body
                className={
                    ['dark', 'success', 'danger'].includes((variant as string)?.toLowerCase()) ? 'text-white' : ''
                }
            >
                {msg}
            </Toast.Body>
        </Toast>
    );
};
