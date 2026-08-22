---
type: always_apply
description: Rules for Redux
---

- Keep popup, input, and component-owned state local
- Use Redux only for global state shared or controlled across many places
- Avoid global-by-default state and prop drilling; lift locally or use scoped context
- Connect Redux in business components; keep reusable UI prop-driven
- Prefer logical slices: API, UI, specialty (approved by user), by default if UI only all goes into one slice
