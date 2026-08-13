---
type: always_apply
description: Set of rules for projects with MUI
paths:
    - '**/*.tsx'
---

- To use MUI default classes always use following notation because it's the only one that works with minification:
    - Import: `import Input, { inputClasses } from '@mui/material/Input';`
    - Usage: `<Box sx={{ [``& .${inputClasses.root}``]: { /* styles */ } }}><Input /></Box>`

# Admin Pages & Login

- ALWAYS use MUI for admin interfaces (Tailwind is ONLY for user-facing sites, see tailwind.md)
- ALWAYS use [`@toolpad/core`](https://mui.com/toolpad/core/introduction/) for admin page layouts and login screens: `AppProvider`, `DashboardLayout`, `PageContainer`, `SignInPage`
- ALWAYS prefer `@kirill.konshin/mui/admin` (`AdminAppProvider`, `AdminDashboardLayout`, `AdminSignInPage`) over hand-rolled `NextAppProvider`/`DashboardLayout`/`SignInPage` boilerplate; `AdminSignInPage.loginAction` takes `loginFormAction` from `@kirill.konshin/auth` (see auth.md)
- Use as less custom JSX as possible — prefer Toolpad built-ins (navigation, dialogs, notifications, CRUD) over hand-rolled components

# Next.js

- When MUI is used with Next.js ALWAYS add barrel-heavy packages to `experimental.optimizePackageImports`: `@mui/material`, `@mui/system`, `@mui/icons-material`, `@mui/lab`, `@mui/x-data-grid`, `@toolpad/core`, plus the other usual suspects (`@fortawesome/*`, `@gravity-ui/icons`, `@gravity-ui/uikit`, `lodash`, `@heroui/react`, `react-bootstrap`, `@kirill.konshin/icons`)
- Prefer `defineNextConfig` from `@kirill.konshin/next/config` which sets the exhaustive list — extra entries are ignored, missing ones cost dev startup and bundle size (see nextjs.md)
