'use client';

import React, { type ComponentProps, type FC, memo } from 'react';

import { DashboardLayout } from '@toolpad/core/DashboardLayout';
import { PageContainer } from '@toolpad/core/PageContainer';

export type AdminDashboardLayoutProps = ComponentProps<typeof DashboardLayout> & {
    /** Wrap children in Toolpad `PageContainer`, default true */
    pageContainer?: boolean;
};

// Client wrapper is mandatory: @toolpad/core ships some DashboardLayout modules without
// 'use client' banners (AppTitle, DashboardHeader — verified still missing in 0.16), which crash
// when evaluated in the server graph. Re-check on Toolpad upgrades.
export const AdminDashboardLayout: FC<AdminDashboardLayoutProps> = memo(function AdminDashboardLayout({
    children,
    pageContainer = true,
    ...props
}) {
    return (
        <DashboardLayout defaultSidebarCollapsed {...props}>
            {pageContainer ? <PageContainer>{children}</PageContainer> : children}
        </DashboardLayout>
    );
});
