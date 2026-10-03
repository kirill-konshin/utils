# Releases

Automated with Nx Release + Conventional Commits (see `release` config in root `nx.json`):

- Commit type determines the bump: `fix` = patch, `feat` = minor, `!` or `BREAKING CHANGE:` footer = major, other types = no release
- A package is released when a releasable commit touches its files — the commit scope is informational only
- Versions in source `package.json` files are always `0.0.0`; real versions live in git tags (`@kirill.konshin/<pkg>@x.y.z`) and are applied only at publish time on CI

Current state: individual packages with independent versions. Used to be megapackage, now abandoned.
