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
- Use as less custom JSX as possible — prefer Toolpad built-ins (navigation, dialogs, notifications, CRUD) over hand-rolled components
