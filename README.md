# Utils Monorepo

## Repo Structure

### Dev Dependencies

Repo is using hybrid NX-like dependency management strategy:

- [Single Version Policy](https://nx.dev/concepts/decisions/dependency-management#single-version-policy) for truly common packages like `react`, `typescript`, `wait-on` are defined in root `package.json`
- [Independently Maintained Dependencies](https://nx.dev/concepts/decisions/dependency-management#independently-maintained-dependencies) for all other packages
- Except demos, all dependencies are defined individually in their `package.json`

### Turbo

All common library tasks are defined in root `turbo.json`: `clean`, `build`, `start` & `wait`.

### TypeScript

All packages extend root `tsconfig.json`.

### Changesets

Normal flow: create branch, create MR, add changesets, merge MR.

Quick flow: locally run `yarn changeset`, then `yarn changeset version` and then CI will publish.
