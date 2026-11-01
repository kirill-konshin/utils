# @kirill.konshin/mui

MUI utilities (main entry), the pinned and fixed Toolpad (`/toolpad` entry) and admin presets built on it (`/admin` entry).

# Peer versions

`@toolpad/core` is a dependency pinned to `0.16.0`, its last release: the project is archived. It declares `@mui/material` `^7` and `next` `^14 || ^15` as peers but works with MUI 9 and Next.js 16; Yarn warns about it. Keep it until it breaks, then port the [CRUD dashboard template](https://mui.com/material-ui/getting-started/templates/#free-templates) (MUI's recommended replacement) behind the same names. Apps provide its peers: `@mui/material`, `@mui/icons-material`, `@emotion/react`.

`@kirill.konshin/auth` is an OPTIONAL peer and is only referenced in types: the `/admin` entry has no runtime dependency on it, so `AdminAppProvider` and `AdminDashboardLayout` work in apps with no auth at all. Install `@kirill.konshin/auth` only when you use `AdminSignInPage`.

# Toolpad — `@kirill.konshin/mui/toolpad`

Every `@toolpad/core` module (`AppProvider`, `DashboardLayout`, `SignInPage`, `Account`, `PageContainer`, `Crud`, the hooks, `locales`, `persistence`, `nextjs`) under the same names, so an app only changes the import path. Differences:

- Component modules are client boundaries: Toolpad 0.16 ships some (`AppTitle`, `DashboardHeader`) without `'use client'`, they crash when a Server Component imports them directly
- `SignInPage`, same props: a `signIn` that redirects keeps the form busy instead of an unhandled rejection; no browser validation popups and no misaligned password label ([#4572](https://github.com/mui/toolpad/issues/4572))
- Left out: the `react-router` and `tanstack-router` integrations (they load optional libraries)

# Admin — `@kirill.konshin/mui/admin`

Preconfigured [`@toolpad/core`](https://mui.com/toolpad/core/introduction/) building blocks for password-protected admin apps, wired to [`@kirill.konshin/auth`](https://github.com/kirill-konshin/utils/tree/main/packages/auth):

- `AdminAppProvider` — `NextAppProvider` with sign-out built from a `logoutAction` server action
- `AdminDashboardLayout` — `DashboardLayout` (sidebar collapsed by default) wrapping children in `PageContainer`
- `AdminSignInPage` — the fixed `SignInPage` for password-only login: single credentials provider, no email/rememberMe, takes `auth.loginFormAction`, renders setup instructions when `isConfigured` is false; on a dedicated login page pass `state={auth.getReturnTo(await searchParams)}` to return users to the page they came from

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

export function AdminShell({ children, logoutAction }: { children: React.ReactNode; logoutAction: PasswordAuth['logout'] }) {
    return (
        <AdminAppProvider branding={{ title: 'Admin', homeUrl: '/admin' }} navigation={NAVIGATION} logoutAction={logoutAction}>
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

export function AdminSignIn({ loginAction, isConfigured }: { loginAction: PasswordAuth['loginFormAction']; isConfigured: boolean }) {
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
