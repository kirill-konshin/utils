---
name: lint-vercel
description: Vercel project setup - the Vercel CLI as a dev dependency, the committed repository link (`.vercel/repo.json`) so every clone is linked without `vercel link`, what stays out of git in `.vercel/`, the Yarn install command for projects whose root package is ESM. Use when adding Vercel to a project, running `vercel link`, editing `vercel.json`, editing the `.vercel` lines of `.gitignore`, or when a Vercel install fails with Yarn / Corepack.
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

# Install with Yarn

The root `package.json` has `"type": "module"` (`@kirill.konshin/lint` requires it). With `ENABLE_EXPERIMENTAL_COREPACK=1`, Vercel downloads Yarn into `.vercel/cache/corepack/`, inside the repository, so Node loads Yarn's CommonJS bundle as ESM and `yarn install` crashes with `Dynamic require of "util" is not supported`. Set the install command in `vercel.json` instead:

```json
{
    "installCommand": "npm i -g corepack@latest && corepack enable && yarn install --immutable"
}
```

- Remove the `ENABLE_EXPERIMENTAL_COREPACK` env var from the Vercel project
- Yarn's files then live outside the repository, as on GitLab (the `lint-gitlab` skill), and `"type": "module"` stays
- Not tested on Vercel yet: global npm installs normally work there; confirm on the first deploy
- Do not remove `"type": "module"` from the root `package.json`, the workaround Vercel staff suggest: it works, but `@kirill.konshin/lint` requires the field and Node warns on every load of `lint.config.ts`
