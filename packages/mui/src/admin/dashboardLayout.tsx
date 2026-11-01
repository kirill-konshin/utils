'use client';

import React, { type ComponentProps, type FC, memo } from 'react';

import { DashboardLayout } from '../toolpad/dashboardLayout';
import { PageContainer } from '../toolpad/pageContainer';

export type AdminDashboardLayoutProps = ComponentProps<typeof DashboardLayout> & {
    /** Wrap children in Toolpad `PageContainer`, default true */
    pageContainer?: boolean;
};

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
