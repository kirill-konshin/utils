---
description: Fix and normalize eslint/prettier file-extension lists everywhere they are defined (.editorconfig, .idea/*, configs, docs) against the canonical sets in @kirill.konshin/lint
---

Normalize every place in this repo that defines which file extensions ESLint / Prettier / the IDE formatter apply to, so they all agree with the canonical sets.

# Canonical source of truth

Read the current values from `packages/lint/index.js` (do NOT hardcode them — they evolve):

- `tsExtsRaw` — TS/JS code extensions
- `eslintExtsRaw` — everything ESLint lints = `tsExtsRaw` + docs/markup (md, mdx, htm, html, vue)
- `prettierExtsRaw` — Prettier-only formats (styles, data, config: css, yml, json, xml, ...)

Division logic (must hold everywhere):

- **TS side** (`eslintExtsRaw`) → ESLint scope, **4 spaces** indent
- **non-TS side** (`prettierExtsRaw`) → Prettier-only scope, **2 spaces** indent
- **Full Prettier scope** = `eslintExtsRaw` + `prettierExtsRaw` (Prettier default `tabWidth: 2` with a `tabWidth: 4` override for `eslintExts` — see the `prettier` export in the same file)

Sanity check first: `eslintExtsRaw` and `prettierExtsRaw` must not intersect, and every extension must belong to exactly one indent group. If the canonical lists themselves are inconsistent, stop and report instead of propagating.

# Known locations to normalize

| File                              | What must match                                                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `.editorconfig`                   | 4-space section = `[*.{<eslintExtsRaw>}]`; 2-space section = `[*.{<prettierExtsRaw>}]`                                                |
| `.idea/prettier.xml`              | `myFilesPattern` = `{**/*,*}.{<eslintExtsRaw + prettierExtsRaw>}` (the `{**/*,*}` shape covers root-level files)                      |
| `.idea/jsLinters/eslint.xml`      | `files-pattern` = `**/*.{<eslintExtsRaw>}` — add the option if missing                                                                |
| `packages/lint/rules/webstorm.md` | the `prettier.xml` and `jsLinters/eslint.xml` templates — same values as the two rows above                                           |
| `packages/lint/README.md`         | "IDEA settings" section: Eslint line = `eslintExtsRaw`, Prettier line = full Prettier scope, same pattern shapes as the `.idea` files |
| `eslint.config.mjs` (root)        | hardcoded code-file globs (e.g. the Nx module-boundaries `files`) should import `tsExts` from the package instead of inlining a list  |

In JS/TS files prefer importing `tsExts` / `eslintExts` / `prettierExts` from `@kirill.konshin/lint` over pasting literals. In non-importable formats (xml, editorconfig, md docs) paste the literal expansion.

# Discover other occurrences

Grep for brace-glob extension lists — pattern like `\{[a-z0-9]+(,[a-z0-9]+)+\}` — across `*.{xml,iml,md,js,mjs,cjs,ts,json,yml}` and `.editorconfig`, excluding `node_modules`, `.git`, `dist`, `coverage`, `.nx`, `.yarn`, `CHANGELOG.md`, and `.idea/workspace.xml` (user-local, never touch). Triage every hit:

- **In scope**: anything defining ESLint/Prettier/IDE-formatter file scope or indent width per extension group.
- **Out of scope — leave alone**: globs that discover files for other tools rather than formatting scope: Tailwind `content` globs, test-runner config discovery (`jest.config.{ts,js,mjs,cjs}` in `packages/lint/rules/{jest,testing}.md`), `unicorn/filename-case` ignore regexes, Nx/CI path filters. When unsure, flag it in the report instead of changing it.

# Normalization rules

- Use the exact extension order from `index.js` (`tsExtsRaw` order first, then the extra eslint extensions, then `prettierExtsRaw` order). Byte-identical lists everywhere.
- No spaces inside braces, all lowercase.
- Pattern _shape_ authority is the `webstorm.md` template (`{**/*,*}.` for Prettier, `**/*.` for ESLint); extension _set_ authority is `index.js`. If shapes disagree between locations, normalize to the template and note it in the report.
- Only propagate the canonical lists — never edit `tsExtsRaw`/`eslintExtsRaw`/`prettierExtsRaw` themselves (e.g. the `TODO mdx` stays as-is).
- If a location has a deliberately narrower scope (e.g. a glob limited to `src/`), keep its path prefix and only normalize the extension braces.

# Verify and report

1. Run `yarn lint` (or at minimum `yarn prettier --check` on the modified files plus `eslint` on one sample package) to confirm nothing broke.
2. Report a table: file → old list → new list, including extensions **added** where they change tool behavior (e.g. enabling ESLint on `md` in the IDE), so each change can be vetoed.
3. List anything flagged as ambiguous/out-of-scope that was left untouched.
