# Changesets

Changesets is a tool for managing versioning and changelogs in monorepos.

## Workflow

Normal flow: create branch, create MR/PR, add changesets, merge MR/PR.

Quick flow: locally run `yarn changeset` (or `npx changeset`), then `yarn changeset version` and then CI will publish.

## Commands

- `changeset` - Create a new changeset
- `changeset version` - Apply changesets and bump versions
- `changeset publish` - Publish packages to npm

## Megapackage vs Individual Packages

When designing a monorepo, consider the tradeoffs:

- **Megapackage**: All packages are bundled into a single package
    - ✅ Easier to consume, one install and import to use
    - ❌ Larger bundle sizes and slower installs
- **Individual packages**: Each package is published separately
    - ❌ More complex dependency management and versioning for consumers
    - ✅ Smaller bundle sizes and faster installs
    - ✅ Easier to adopt and requires less commitment from consumers
