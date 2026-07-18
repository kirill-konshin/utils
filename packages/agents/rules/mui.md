---
type: always_apply
description: Set of rules for projects with MUI
paths:
    - '**/*.tsx'
---

- To use MUI default classes always use following notation because it's the only one that works with minification:
    - Import: `import Input, { inputClasses } from '@mui/material/Input';`
    - Usage: `<Box sx={{ [``& .${inputClasses.root}``]: { /* styles */ } }}><Input /></Box>`
