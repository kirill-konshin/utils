---
name: lint-mui
description: Our MUI conventions on top of the vendor MUI skills - class-name usage in `sx`, safe-area insets in the theme, which package to use for admin pages and login. Use when writing or reviewing code that uses MUI, or building an admin interface.
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

Use `@kirill.konshin/mui`: the `/admin` presets and `/toolpad` (Toolpad, pinned and fixed). Details: the `mui` skill, it installs with the package.

When Toolpad does not cover what you need, start from the [free Material UI templates](https://mui.com/material-ui/getting-started/templates/#free-templates) (dashboard, CRUD dashboard, sign-in, sign-up, checkout, blog, marketing page): copy the parts you need into the app, do not write them from zero.
