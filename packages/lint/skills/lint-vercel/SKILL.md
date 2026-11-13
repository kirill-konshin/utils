---
name: lint-vercel
description: Vercel project setup - the Vercel CLI as a dev dependency, the committed repository link (`.vercel/repo.json`) so every clone is linked without `vercel link`, what stays out of git in `.vercel/`, the Yarn install command for projects whose root package is ESM, local development env vars from the Vercel Development environment (`vercel env pull`, Neon / Marketplace integration connected to Development). Use when adding Vercel to a project, running `vercel link`, editing `vercel.json`, editing the `.vercel` lines of `.gitignore`, setting up env vars or a database for local development, or when a Vercel install fails with Yarn / Corepack.
---

Other platform operations (deploy, env vars in other environments, domains, logs): the `vercel-cli` skill.

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

# Development environment variables

CONFIRM WITH USER IF USER WANTS AN INSTRUCTION OR YOU SET THE VARS!

When a Vercel project runs locally, propose this setup to the user: the Vercel **Development** environment keeps the local variables, and `vercel env pull` writes them to the env file of the app. Then no person copies secrets by hand, and the env file stays out of git.

Pull:

```bash
yarn vercel env pull <app-dir>/.env.local
```

- The file path is specific to the app: use the env file that the framework of the app loads, in the directory of the app (Next.js: `<app-dir>/.env.local`); make sure that `.gitignore` ignores it
- Run the command where the link resolves to the project (see [Repository link](#repository-link))
- The command pulls the Development environment by default
- The command replaces all of the file (it asks first, `--yes` does not ask): do not edit the pulled file by hand
- Put local overrides for one machine in a file that the framework loads with a higher priority and the pull does not write (Next.js: `.env.development.local`)

Set the variables:

- Add a variable only to Development when its value is different on a local machine, for example an OAuth redirect URI (`http://localhost:3000/redirect`) or the client ID and secret of a local OAuth app
- Add or change a variable in the dashboard (Settings → Environment Variables) or with `yarn vercel env add <NAME> development`, then pull again
- A variable that an integration owns (Neon and other Marketplace storage, with the integration icon) cannot be edited one by one: connect the integration to Development (below)

Connect a database integration (Neon) to Development. Do the two steps, because each step controls a different setting:

1. Storage → the database → **Settings** → **Allowed Environments**: select **All environments**. This lets the resource connect to Development
2. Storage → the database → **Projects** → ⋯ in the row of the project → **Update Project Connection**: select **Development**. This adds the variables to the Development environment of the project
3. Check: the **Environments** column of the project row shows Development. Then pull again

- Development then uses the same database branch as Production: local writes change production data. When that is not acceptable, tell the user and propose a separate Neon branch for Development (the `neon-postgres-branches` skill)

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
