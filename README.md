# Utils Monorepo

## Releases

Releases are fully automated with [Nx Release](https://nx.dev/docs/guides/nx-release) and [Conventional Commits](https://www.conventionalcommits.org): every commit to `main` is a potential release, no release PRs or changeset files.

- `fix(scope): ...` — patch release of every package the commit touches
- `feat(scope): ...` — minor release
- `feat(scope)!: ...` or a `BREAKING CHANGE:` footer — major release
- other types (`chore`, `docs`, `refactor`, `test`, ...) — no release

A package is released when a `feat`/`fix` commit touches its files — the scope in the message is for humans and changelogs only. Package versions in source are always `0.0.0`: real versions live in git tags (`@kirill.konshin/<pkg>@x.y.z`) and are written into `package.json` only at publish time on CI. Changelogs are published as GitHub Releases.

Commit messages are validated locally by a `commit-msg` hook (commitlint) and on CI. PRs are squash-merged with the PR title as the commit message, so the title must also be a valid conventional commit (validated by the PR workflow).

### First publish & backfill (manual)

CI publishes via npm [trusted publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC), which cannot publish a package that does not exist on npm yet ([npm/cli#8544](https://github.com/npm/cli/issues/8544)). A new package's first release run will tag and create the GitHub Release, then fail the publish. Fix by publishing the tagged version manually — same procedure backfills any version where a tag exists but the npm publish failed (tags/releases stay intact).

Requires `npm login` (not Yarn). Per package, with `<pkg>`/`<version>` from the failed tag `@kirill.konshin/<pkg>@<version>`:

```bash
git pull --tags
yarn install
yarn run build:packages
cd /Users/dis/Sites/Libs/utils/packages/<pkg> && npm pkg set version=0.0.1 && npm publish --otp=
```

After the first publish, add a Trusted Publisher on npmjs.com (package → Settings → Trusted Publisher → GitHub Actions): organization `kirill-konshin`, repository `utils`, workflow `release.yml`, environment `npm-publish`. Without it every CI publish of that package fails.

## Commands

- `yarn build` / `yarn test` / `yarn start` / `yarn serve` — run tasks for everything (packages + demos); no suffix means all
- `yarn build:packages` / `yarn test` / ... — scoped to publishable packages (`@kirill.konshin/*`)
- `yarn build:affected` / `yarn test:affected` — only projects affected vs `main`, demos excluded (used by PR CI)
- `yarn lint` — lint everything (eslint + prettier)
- `yarn release --dry-run` — preview what the next release would do
- Coordinated release of all packages at once (or force an exact version): GitHub → Actions → Release → Run workflow, with a specifier (`patch`, `minor`, `major`, or an exact version like `1.0.0`)
- `git config remote.origin.tagOpt --tags` suggested to pull tags always

## AI Commands

`/normalize-extensions` — checks all usual places where Prettier / ESLint extensions are defined and normalizes the lists for consistency
`/lint-repo` — sets up/updates the ESLint·Prettier·Husky tooling, and/or audits the repo against the agent rules (`@kirill.konshin/lint`)
