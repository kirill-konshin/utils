# Changesets

Normal flow: create branch, create MR, add changesets, merge MR.

Quick flow: locally run `yarn changeset`, then `yarn changeset version` and then CI will publish.

# Megapackage vs individual packages

- **Megapackage**: All packages are bundled into a single package
    - ✅Easier to consume, one install and import to use
    - ❌Larger bundle sizes and slower installs
- **Individual packages**: Each package is published separately, which allows for smaller bundle sizes and faster installs.
    - ❌More complex dependency management and versioning for consumers, but NPM should warn (TODO check)
    - ✅Easier to adopt and requires less commitment from consumers
    - ✅Looks cleaner

Current state: individual packages. Used to be megapackage, now abandoned.
