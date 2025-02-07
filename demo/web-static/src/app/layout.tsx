'use client';

import React from 'react';

export default function Layout({ children }) {
    return (
        <html lang="en">
            <head>
                <title>Web Static</title>
            </head>
            <body>{children}</body>
        </html>
    );
}
