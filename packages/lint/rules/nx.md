---
type: always_apply
description: Set of rules for MONOREPO projects which use Turbo or NX
paths:
    - '**/nx.json'
    - '**/package.json'
    - '**/project.json'
---

# NX

- If NX is used root `package.json` must have `nx show projects > /dev/null` in the `prepare`/`postinstall` script, so the project graph cache exists for tools that read it outside `nx` — e.g. `@nx/eslint-plugin` rules in a bare `eslint` run silently skip without it. With `prepare`, Yarn 2+ skips it on install — run `yarn prepare` explicitly (after cloning + as a CI step); with `postinstall` (private root) Yarn runs it on install, so no extra step
- NX Release (v23+) with conventional commits silently demotes bumps for `0.x` packages (breaking → minor, `feat` → patch) while the log still claims `Applied semver relative bump "minor"`;
    - set `release.version.adjustSemverBumpsForZeroMajorVersion: false` in `nx.json` if `feat:` must bump minor before `1.0.0`
- Root NX task-script convention: bare name = `nx run-many -t <target>` over all projects (`build`/`test`/`start`/`serve`), with concurrency flags set once here;
- Add a NX scripts to root `package.json`:
    - `<target>:packages` scopes to publishable libs (`yarn <target> --projects '@scope/*'`);
    - `<target>:affected` = `nx affected -t <target>` for CI (exclude demos, diff vs `origin/main`)
    - `release:preview` script (`nx release --dry-run --verbose`) to preview, per package, the resolved-from tag, the bump reason (or `🚫 No changes`), and covered commits before releasing;
        - the `changelog`/`version` subcommands can't substitute (changelog needs an explicit version, version rejects a top-level `release.git`).
        - Build-free check of one package's range: `git log <pkg-tag>..HEAD -- <pkg-dir>`

- Commit changes to root `package.json` or `yarn.lock` or `nx.json` ONLY as `chore` otherwise ALL packages will be bumped
    - https://github.com/nrwl/nx/issues/34542 (root file changes → all bumped)
- NX Release attributes commits to projects by FILE PATHS via `nx affected` against the CURRENT graph — commit scope (`feat(pkg):`) does not limit attribution
    - NEVER fully delete (or `nx g move`-rename) a package: a historical `feat`/`fix` that touched a `package.json`/`project.json` which no longer exists on disk is attributed to ALL projects, and mass-bumps the whole workspace on the very next release run (even a `chore` push);
    - ALWAYS leave a tombstone `package.json` at the EXACT old path (`private: true`, no scripts), and exclude it in `release.projects` (`!packages/<retired>`) so it's never versioned/published;
    - removable only once EVERY package has a tag newer than the last `feat`/`fix` that touched the retired `package.json`;
    - moving the tombstone elsewhere breaks it — the check is on the historical file path
    - https://github.com/nrwl/nx/issues/33374 (delete/rename → all released)
    - https://github.com/nrwl/nx/issues/34277 (scans too much, slow, warnings for removed)
