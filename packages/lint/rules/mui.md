---
type: always_apply
description: Set of rules for projects with MUI
paths:
    - '**/*.tsx'
    - '**/*.ts'
---

Details and admin pages: the `lint-mui` skill.

- Import from the barrels (`@mui/material`, `@mui/icons-material`) in apps; use direct imports (`@mui/material/Button`) in libraries
    - This rule overrides `bundle-barrel-imports` of the `vercel-react-best-practices` skill
- Target MUI default classes only through the stable `*Classes` names (e.g. `inputClasses.root`), never through literal class strings
