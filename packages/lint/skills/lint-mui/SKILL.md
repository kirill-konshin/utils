---
name: lint-mui
description: Our MUI conventions on top of the vendor MUI skills - class-name usage in `sx`, safe-area insets in the theme, admin pages and login with `@kirill.konshin/mui/admin`. Use when writing or reviewing code that uses MUI, or building an admin interface.
---

The binding rules are in [rules/mui.md](../../rules/mui.md): imports, no Tailwind, Toolpad. MUI API knowledge: the `material-ui-styling` skill, the `material-ui-theming` skill and the `material-ui-nextjs` skill; where they differ, the rules win.

# Class Names

The `*Classes` names survive minification; literal `.Mui-*` classes work too.

```tsx
import { Box, Input, inputClasses } from '@mui/material';

<Box sx={{ [`& .${inputClasses.root}`]: {}, [`& .${inputClasses.disabled}`]: {} }}>
    <Input />
</Box>;
```

# Theme

- Define safe-area insets in the theme or globally; consume them through `sx`, never through repeated `env(...)`.

# Admin Pages and Login

- Use `@kirill.konshin/mui/admin`: `AdminAppProvider`, `AdminDashboardLayout`, `AdminSignInPage`. It holds the Toolpad boilerplate (`@toolpad/core` is archived: add no new direct Toolpad usage).
- `AdminSignInPage.loginAction` takes `loginFormAction` from `@kirill.konshin/auth` ([rules/auth.md](../../rules/auth.md)).
- Use the built-ins of the admin layout (navigation, dialogs, notifications) before custom JSX.
