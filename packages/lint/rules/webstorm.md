---
type: always_apply
description: IDEA / WebStorm patterns
paths:
    - '**/.idea/**/*.*'
    - '**/.gitignore'
---

- **ALL** IDEA / WebStorm projects must adhere to the `lint-webstorm` skill templates unless explicitly prohibited - use the skill to set up or check `.idea` files
- Preserve already existing settings, add what's safe, ask user how to merge if there are conflicts
- Heavy folders nothing needs to search (`dist`, `build`, `coverage`, `.next`, `.nx`, `.turbo`, `.worktrees`, ...) are excluded in three places: `.gitignore`, "Mark as excluded" (`excludeFolder` / `excludePattern` in `.idea/%projectName%.iml`) and index exclusion (`.idea/indexLayout.xml`) - keep the three in sync, or at least on a shared baseline: some folders are only git-ignored, others only marked as excluded
- Git worktrees clash with IDEA module names - use the `lint-worktree` skill
