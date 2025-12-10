# Turbo

General Turbo rules are provided by `@kirill.konshin/agents` package.
See: `packages/agents/rules/03-turbo.md`

# Repo-Specific

All common library tasks are defined in root `turbo.json`: `clean`, `build`, `start` & `wait`.

Library packages run `start` (`vite build --watch`) which produces `dist/index.js`.
