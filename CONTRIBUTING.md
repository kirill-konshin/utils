This repo uses [Conventional Commits](https://www.conventionalcommits.org) with
[Nx Release](https://nx.dev/docs/guides/nx-release) to automate releases. For you, the
contributor, this means commit messages (and PR titles, since PRs are squash-merged)
must follow the convention — they are validated by a git hook and by CI:

- `fix(scope): ...` — patch release
- `feat(scope): ...` — minor release
- `feat(scope)!: ...` or a `BREAKING CHANGE:` footer — major release
- `chore`, `docs`, `refactor`, `test`, ... — no release

Packages are released automatically when commits land on `main`. A package is released
if a `feat`/`fix` commit touches its files, so keep commits scoped to one package where
possible.
