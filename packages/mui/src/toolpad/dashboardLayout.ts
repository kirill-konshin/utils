'use client';

// Toolpad ships some of these modules without a 'use client' banner (AppTitle, DashboardHeader in 0.16), which crash
// when a Server Component imports them directly; this boundary makes them safe there
export {
    DashboardHeader,
    DashboardLayout,
    DashboardSidebarPageItem,
    ThemeSwitcher,
    ToolbarActions,
} from '@toolpad/core/DashboardLayout';
export type {
    DashboardHeaderProps,
    DashboardHeaderSlotProps,
    DashboardHeaderSlots,
    DashboardLayoutProps,
    DashboardLayoutSlotProps,
    DashboardLayoutSlots,
    DashboardSidebarPageItemContextProps,
    DashboardSidebarPageItemProps,
    SidebarFooterProps,
} from '@toolpad/core/DashboardLayout';
