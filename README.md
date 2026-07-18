# Utils Monorepo

## Releases

Releases are fully automated with [Nx Release](https://nx.dev/docs/guides/nx-release) and [Conventional Commits](https://www.conventionalcommits.org): every commit to `main` is a potential release, no release PRs or changeset files.

- `fix(scope): ...` — patch release of every package the commit touches
- `feat(scope): ...` — minor release
- `feat(scope)!: ...` or a `BREAKING CHANGE:` footer — major release
- other types (`chore`, `docs`, `refactor`, `test`, ...) — no release

A package is released when a `feat`/`fix` commit touches its files — the scope in the message is for humans and changelogs only. Package versions in source are always `0.0.0`: real versions live in git tags (`@kirill.konshin/<pkg>@x.y.z`) and are written into `package.json` only at publish time on CI. Changelogs are published as GitHub Releases.

Commit messages are validated locally by a `commit-msg` hook (commitlint) and on CI. PRs are squash-merged with the PR title as the commit message, so the title must also be a valid conventional commit (validated by the PR workflow).

## Commands

- `yarn build` / `yarn test` / `yarn start` / `yarn serve` — run tasks for everything (packages + demos); no suffix means all
- `yarn build:packages` / `yarn test` / ... — scoped to publishable packages (`@kirill.konshin/*`)
- `yarn build:affected` / `yarn test:affected` — only projects affected vs `main`, demos excluded (used by PR CI)
- `yarn lint` — lint everything (eslint + prettier)
- `yarn release --dry-run` — preview what the next release would do
- Coordinated release of all packages at once (or force an exact version): GitHub → Actions → Release → Run workflow, with a specifier (`patch`, `minor`, `major`, or an exact version like `1.0.0`)

## AI Commands

`/normalize-extensions` — checks all usual places where Prettier / ESLint extensions are defined and normalizes the lists for consistency
`/verify-agent-rules` — runs all rules from `agents` package
`/eslint-config-next-custom` — runs checks agains `eslint-config-next-custom` package `README`
