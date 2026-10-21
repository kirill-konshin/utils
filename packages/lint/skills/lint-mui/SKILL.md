---
name: lint-mui
description: MUI and Toolpad conventions - barrel imports of `@mui/material` / `@mui/icons-material` (direct imports in libraries), stable `*Classes` class names in `sx`, safe-area insets in the theme, admin pages and login with `@toolpad/core` and `@kirill.konshin/mui/admin`, `optimizePackageImports` with Next.js. Use when writing or reviewing code that uses MUI or Toolpad, or building an admin interface.
---

# Imports

- Always import components or icons this way: `import { Paper, Button } from '@mui/material';` and `import { Xxx } from '@mui/icons-material';`
    - See [Next.js](#nextjs)
    - Exception: if developing a library use direct imports with minimal bundle footprint (libraries may not be used with barrel handling)

# Class Names

- To use MUI default classes always use stable minifiable class names:
    - Import: `import { inputClasses } from '@mui/material';` or `import { inputClasses } from '@mui/material/Input';` (see [Imports](#imports))
    - Usage: `<Box sx={{ [``& .${inputClasses.root}``]: { /* styles */ } }}><Input /></Box>`

# Theme

- Define safe-area insets globally or in the theme; consume through `sx`, never repeated `env(...)`

# Admin Pages & Login

- ALWAYS use MUI for admin interfaces (Tailwind is ONLY for user-facing sites, see [rules/tailwind.md](../../rules/tailwind.md))
- ALWAYS use [`@toolpad/core`](https://mui.com/toolpad/core/introduction/) for admin page layouts and login screens: `AppProvider`, `DashboardLayout`, `PageContainer`, `SignInPage`
- ALWAYS prefer `@kirill.konshin/mui/admin` (`AdminAppProvider`, `AdminDashboardLayout`, `AdminSignInPage`) over hand-rolled `NextAppProvider`/`DashboardLayout`/`SignInPage` boilerplate; `AdminSignInPage.loginAction` takes `loginFormAction` from `@kirill.konshin/auth` (see [rules/auth.md](../../rules/auth.md))
- Prefer Toolpad built-ins (navigation, dialogs, notifications, CRUD) over hand-rolled equivalents

# Next.js

- With Next.js, `experimental.optimizePackageImports` MUST list the barrel-heavy MUI packages: `defineNextConfig` sets them, see the `lint-nextjs` skill
