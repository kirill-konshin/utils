# Utils Monorepo

## Changesets

See [changesets.md](packages/agents/rules/02-changesets.md).

## Commands

- `changeset` - Create a new changeset, can be done locally
- `changeset version` - Apply changesets and bump versions, can be done locally on `main`
- `changeset publish` - Publish packages to npm, better be done on CI, just push to main after `changeset version`
