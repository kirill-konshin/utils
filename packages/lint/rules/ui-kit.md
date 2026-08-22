---
type: always_apply
description: Rules for UI kits
---

- Follow UI kit docs and primitives; preserve semantics and accessibility
- Customize ONLY when the kit cannot meet the need and the user approves
- Minimize custom JSX, styles, and wrappers; reuse repeated compositions
- Separate business logic, APIs, and state from presentation; business components may compose UI primitives including UI kit, to a reasonable degree, or if user approves
- Keep reusable UI logic-free, prop-driven, portable, and testable without the store or API
- Use base spacing and type scales; avoid pixel spacing except for exact placement; scale through a few base tokens
- Prefer theme or global overrides to component patches, even for one-offs
- Support mobile safe-area insets through framework primitives
- Design mobile-first; scale up at `md`
