---
type: always_apply
description: Set of rules for projects which use Vercel
paths:
    - '**/vercel.json'
    - '**/.vercel/**'
    - '**/.gitignore'
---

- Applies only when the project uses Vercel (a `vercel` dependency, `vercel.json` or `.vercel/`)
- The Vercel CLI is a `devDependency`
- `.vercel/repo.json` (from `vercel link --repo`) is committed; the rest of `.vercel/` stays ignored: `.vercel/*` with `!.vercel/repo.json` in `.gitignore`, never a bare `.vercel` line
- After `vercel link`, remove the `.vercel` line it appends to `.gitignore`
- Setup and checks: the `lint-vercel` skill
