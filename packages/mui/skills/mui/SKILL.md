---
name: mui
description: Admin pages and login with `@kirill.konshin/mui` - the `/admin` presets (`AdminAppProvider`, `AdminDashboardLayout`, `AdminSignInPage`) wired to `@kirill.konshin/auth`, and `/toolpad`, the pinned and fixed re-export of the archived `@toolpad/core`; migrating an app off `@toolpad/core`. Use when building an admin interface or a login page with MUI, or when code imports Toolpad.
---

# Admin Pages and Login

- Use `@kirill.konshin/mui/admin`. It holds the Toolpad boilerplate:
    - `AdminAppProvider`: `NextAppProvider` with a sign-out from a `logoutAction` Server Action
    - `AdminDashboardLayout`: `DashboardLayout` (sidebar collapsed by default) with the children in `PageContainer`
    - `AdminSignInPage`: password-only login. `loginAction` takes `auth.loginFormAction` of `@kirill.konshin/auth`, re-exported from the app's `'use server'` module. `isConfigured={auth.isConfigured()}` shows setup instructions instead of the form; `state={auth.getState(await searchParams)}` returns the user to the page they came from
- Pass the actions from a Server Component (the layout or the login page) to these Client Components as props
- Use the built-ins of the admin layout (navigation, dialogs, notifications) before custom JSX

# Toolpad: `@kirill.konshin/mui/toolpad`

Toolpad is archived. This package pins `@toolpad/core` at `0.16.0`, its last release, and keeps it until it breaks.

- Import every Toolpad part (`Account`, `PageHeader`, `useDialogs`, `Crud`, ...) from `@kirill.konshin/mui/toolpad`, with the same names as `@toolpad/core`. NEVER import `@toolpad/core` in an app
- Its component modules are client boundaries: a Server Component can import `DashboardLayout` and the others directly
- `SignInPage` has the same props as Toolpad's, with fixes: a `signIn` that redirects keeps the form busy, no browser validation popups, no misaligned password label
- Not included: the `react-router` and `tanstack-router` integrations
- Yarn warns that Toolpad wants `@mui/material` `^7` and `next` `^14 || ^15`: it works with newer versions, ignore the warning

# Migrate an App off `@toolpad/core`

1. Replace every `@toolpad/core/<Module>` import with `@kirill.konshin/mui/toolpad`
2. Replace hand-written login, layout and provider setups with the `/admin` presets where they fit
3. Remove `@toolpad/core` from the app's `package.json`; keep `@mui/material`, `@mui/icons-material` and `@emotion/react`, Toolpad needs them
