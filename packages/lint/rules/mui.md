---
type: always_apply
description: Set of rules for projects with MUI
paths:
    - '**/*.tsx'
    - '**/*.ts'
---

Details: the `lint-mui` skill; admin pages and Toolpad: the `mui` skill of `@kirill.konshin/mui`.

- Import from the barrels (`@mui/material`, `@mui/icons-material`) in apps; use direct imports (`@mui/material/Button`) in libraries
    - This rule overrides `bundle-barrel-imports` of the `vercel-react-best-practices` skill and the one-level imports of the `material-ui-styling` skill
- NEVER mix MUI and Tailwind in one interface; do not follow the `material-ui-tailwind` skill
- `@toolpad/core` is archived (no longer maintained): import it ONLY from `@kirill.konshin/mui/toolpad` (pinned, same names, some components fixed) or the `@kirill.konshin/mui/admin` presets; NEVER add `@toolpad/core` to an app
