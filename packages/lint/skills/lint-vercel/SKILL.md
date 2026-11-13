---
name: lint-vercel
description: Vercel project setup - the Vercel CLI as a dev dependency, the committed repository link (`.vercel/repo.json`) so every clone is linked without `vercel link`, what stays out of git in `.vercel/`. Use when adding Vercel to a project, running `vercel link`, or editing the `.vercel` lines of `.gitignore`.
---

Platform operations (deploy, env vars, domains, logs): the `vercel-cli` skill.

# CLI

- `vercel` is a `devDependency` of the root `package.json`, run through the package manager (`vp exec vercel`, `yarn vercel`), never a global install
- The `vercel` dependency turns on the `vercel-cli` and `deploy-to-vercel` skills (`lint-prepare`)
- Login: `vercel login` once per machine, credentials stay outside the repository; CI uses a `VERCEL_TOKEN` secret

# Repository link

Link with `vercel link --repo`: it writes `.vercel/repo.json`, which maps the Git remote to the team and its projects (one entry per project root, monorepos included). It holds IDs and the remote name, no secrets. Commit it: every clone and machine is then linked.

Everything else in `.vercel/` is local and stays out of git: env files of `vercel pull` (`.vercel/.env.*.local`, secrets), build output of `vercel build` (`.vercel/output`), the per-directory link of plain `vercel link` (`.vercel/project.json`), `README.txt`.

`.gitignore`:

```gitignore
# Vercel: the repository link is shared, the rest of .vercel is local (env files with secrets, build output)
.vercel/*
!.vercel/repo.json
```

- `.vercel/*`, not `.vercel`: git cannot re-include a file inside an ignored directory
- `vercel link` appends a `.vercel` line to `.gitignore` when that exact line is missing, which silently drops the exception: after every `vercel link`, remove the appended `.vercel` line
- Check: `git check-ignore -q .vercel/repo.json` exits 1 (not ignored), `git status -uall` shows `.vercel/repo.json` and nothing else from `.vercel/`
