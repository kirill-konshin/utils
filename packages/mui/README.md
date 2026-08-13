# @kirill.konshin/mui

MUI utilities (main entry) and Toolpad admin components (`/admin` entry).

# Peer versions

`@mui/material` is pinned to `^7` on purpose, even though MUI itself is already on v9: `@toolpad/core` (0.16, latest) still peers on `^7`, so v7 is the correct — and only working — choice today. Bump both together once Toolpad ships v9 support.

`@kirill.konshin/auth` is an OPTIONAL peer and is only referenced in types: the `/admin` entry has no runtime dependency on it, so `AdminAppProvider` and `AdminDashboardLayout` work in apps with no auth at all. Install `@kirill.konshin/auth` only when you use `AdminSignInPage`.

# Admin — `@kirill.konshin/mui/admin`

Preconfigured [`@toolpad/core`](https://mui.com/toolpad/core/introduction/) building blocks for password-protected admin apps, wired to [`@kirill.konshin/auth`](https://github.com/kirill-konshin/utils/tree/main/packages/auth):

- `AdminAppProvider` — `NextAppProvider` with sign-out built from a `logoutAction` server action
- `AdminDashboardLayout` — `DashboardLayout` (sidebar collapsed by default) wrapping children in `PageContainer`; also works around Toolpad 0.16 modules missing `'use client'` banners
- `AdminSignInPage` — `SignInPage` for password-only login: single credentials provider, no email/rememberMe, takes `auth.loginFormAction`, renders setup instructions when `isConfigured` is false; on a dedicated login page pass `state={auth.getReturnTo(await searchParams)}` to return users to the page they came from

```tsx
// app/admin/layout.tsx — Server Component, passes the actions from @/auth down as props
import { auth, loginAction, logoutAction } from '@/auth';
import { AdminShell } from './AdminShell';
import { AdminSignIn } from './AdminSignIn';

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
    const isConfigured = auth.isConfigured();
    if (!isConfigured || !(await auth.isAuthenticated())) {
        return <AdminSignIn loginAction={loginAction} isConfigured={isConfigured} />;
    }
    return <AdminShell logoutAction={logoutAction}>{children}</AdminShell>;
}
```

```tsx
// app/admin/AdminShell.tsx — theme/navigation/branding stay app-specific
'use client';

import type { PasswordAuth } from '@kirill.konshin/auth';
import { AdminAppProvider, AdminDashboardLayout } from '@kirill.konshin/mui/admin';
import DashboardIcon from '@mui/icons-material/Dashboard';

const NAVIGATION = [{ segment: 'admin', title: 'Dashboard', icon: <DashboardIcon /> }];

export function AdminShell({
    children,
    logoutAction,
}: {
    children: React.ReactNode;
    logoutAction: PasswordAuth['logout'];
}) {
    return (
        <AdminAppProvider
            branding={{ title: 'Admin', homeUrl: '/admin' }}
            navigation={NAVIGATION}
            logoutAction={logoutAction}
        >
            <AdminDashboardLayout>{children}</AdminDashboardLayout>
        </AdminAppProvider>
    );
}
```

```tsx
// app/admin/AdminSignIn.tsx
'use client';

import type { PasswordAuth } from '@kirill.konshin/auth';
import { AdminAppProvider, AdminSignInPage } from '@kirill.konshin/mui/admin';

export function AdminSignIn({
    loginAction,
    isConfigured,
}: {
    loginAction: PasswordAuth['loginFormAction'];
    isConfigured: boolean;
}) {
    return (
        <AdminAppProvider branding={{ title: 'Admin' }}>
            <AdminSignInPage loginAction={loginAction} isConfigured={isConfigured} />
        </AdminAppProvider>
    );
}
```

Root layout still needs `AppRouterCacheProvider` from `@mui/material-nextjs/v15-appRouter` (with `options={{ enableCssLayer: true }}`) and your theme.

Wrap `AdminAppProvider` in `<Suspense>`: Toolpad's `NextAppProvider` calls `useSearchParams()`, and `cacheComponents` (set by `defineNextConfig`, see `@kirill.konshin/next`) fails the prerender of any client hook reading URL data outside a boundary.

# Utilities (main entry)

`AppBarOffset`, `FormControlFieldset`, `FormLabelLegend`, `GenericControl`, `ReadOnly` — see stories.

## Prior Art

https://codesandbox.io/p/sandbox/l7vykxl57q MUI v4
