---
type: always_apply
description: Set of rules for projects with MUI
paths:
    - '**/*.tsx'
    - '**/*.ts'
---

Details and admin pages: the `lint-mui` skill.

- Import from the barrels (`@mui/material`, `@mui/icons-material`) in apps; use direct imports (`@mui/material/Button`) in libraries
    - This rule overrides `bundle-barrel-imports` of the `vercel-react-best-practices` skill and the one-level imports of the `material-ui-styling` skill
- NEVER mix MUI and Tailwind in one interface; do not follow the `material-ui-tailwind` skill
- `@toolpad/core` is archived (no longer maintained): use it only through `@kirill.konshin/mui/admin`, add no new direct Toolpad usage
