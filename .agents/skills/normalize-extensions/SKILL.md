---
name: normalize-extensions
description: Fix and normalize the formatter/linter file-extension lists (Oxfmt/Oxlint with Vite+, Prettier/ESLint without) everywhere they are defined (.editorconfig, vitePlus.ts, .idea/*, configs, docs) against the canonical sets in @kirill.konshin/lint
---

Normalize every place in this repo that defines which file extensions the formatter (Oxfmt with Vite+, Prettier without), the linter (Oxlint / ESLint) and the IDE apply to, so they all agree with the canonical sets.

# Canonical source of truth

Read the current values from `packages/lint/src/exts.ts` (do NOT hardcode them — they evolve):

- `tsExtsRaw` — TS/JS code extensions
- `eslintExtsRaw` — everything ESLint lints = `tsExtsRaw` + docs/markup (md, mdx, htm, html, vue)
- `prettierExtsRaw` — Prettier-only formats (styles, data, config: css, yml, json, xml, ...)

Division logic (must hold everywhere):

- **TS side** (`eslintExtsRaw`) → ESLint scope, **4 spaces** indent
- **non-TS side** (`prettierExtsRaw`) → format-only scope, **2 spaces** indent
- **Full format scope** = `eslintExtsRaw` + `prettierExtsRaw`: default `tabWidth: 2` with a `tabWidth: 4` override for `eslintExts`
    - Vite+: `fmtConfig` and `stagedConfig` in `packages/lint/src/vitePlus.ts`
    - Without Vite+: the `prettier` export in `packages/lint/src/prettier.ts`

Sanity check first: `eslintExtsRaw` and `prettierExtsRaw` must not intersect, and every extension must belong to exactly one indent group. If the canonical lists themselves are inconsistent, stop and report instead of propagating.

# Known locations to normalize

| File | What must match |
| --- | --- |
| `.editorconfig` | 4-space section = `[*.{<eslintExtsRaw>}]`; 2-space section = `[*.{<prettierExtsRaw>}]` |
| `packages/lint/src/vitePlus.ts` (Vite+) | `fmtConfig` `tabWidth: 4` override = `**/${eslintExts}`; `stagedConfig` glob = full format scope (`tsExtsRaw`, `markupExtsRaw`, `prettierExtsRaw`); both built from `exts.ts` imports, never literal lists |
| `.idea/prettier.xml` (without Vite+; with Vite+ Prettier is disabled and the Oxc plugin keeps its default extension lists) | `myFilesPattern` = `{**/*,*}.{<eslintExtsRaw + prettierExtsRaw>}` (the `{**/*,*}` shape covers root-level files) |
| `.idea/jsLinters/eslint.xml` (without Vite+; deleted with Vite+) | `files-pattern` = `**/*.{<eslintExtsRaw>}` — add the option if missing |
| `packages/lint/skills/lint-webstorm/SKILL.md` (without Vite+) | the `prettier.xml` and `jsLinters/eslint.xml` templates — same values as the two rows above |
| `packages/lint/README.md` (without Vite+) | "IDEA settings" section: Eslint line = `eslintExtsRaw`, Prettier line = full Prettier scope, same pattern shapes as the `.idea` files |
| `vite.config.ts` (root) | hardcoded code-file globs (e.g. the Nx module-boundaries `files`) should import `tsExts` from `@kirill.konshin/lint/vite-plus` instead of inlining a list |

In JS/TS files prefer importing `tsExts` / `eslintExts` / `prettierExts` from `@kirill.konshin/lint` (`tsExts` also from `/vite-plus`) over pasting literals. In non-importable formats (xml, editorconfig, md docs) paste the literal expansion.

# Discover other occurrences

Grep for brace-glob extension lists — pattern like `\{[a-z0-9]+(,[a-z0-9]+)+\}` — across `*.{xml,iml,md,js,mjs,cjs,ts,json,yml}` and `.editorconfig`, excluding `node_modules`, `.git`, `dist`, `coverage`, `.nx`, `.yarn`, `CHANGELOG.md`, and `.idea/workspace.xml` (user-local, never touch). Triage every hit:

- **In scope**: anything defining formatter / linter / IDE-formatter file scope or indent width per extension group.
- **Out of scope — leave alone**: globs that discover files for other tools rather than formatting scope: Tailwind `content` globs, test-runner config discovery (`jest.config.{ts,js,mjs,cjs}` in `packages/lint/rules/{jest,testing}.md`), `unicorn/filename-case` ignore regexes, Nx/CI path filters. When unsure, flag it in the report instead of changing it.

# Normalization rules

- Use the exact extension order from `exts.ts` (`tsExtsRaw` order first, then the extra eslint extensions, then `prettierExtsRaw` order). Byte-identical lists everywhere.
- No spaces inside braces, all lowercase.
- Pattern _shape_ authority is the `lint-webstorm` skill template (`{**/*,*}.` for Prettier, `**/*.` for ESLint); extension _set_ authority is `exts.ts`. If shapes disagree between locations, normalize to the template and note it in the report.
- Only propagate the canonical lists — never edit `tsExtsRaw`/`eslintExtsRaw`/`prettierExtsRaw` themselves (e.g. the `TODO mdx` stays as-is).
- If a location has a deliberately narrower scope (e.g. a glob limited to `src/`), keep its path prefix and only normalize the extension braces.

# Verify and report

1. Run `yarn lint` (`vp check --fix`; without Vite+ at minimum `yarn prettier --check` on the modified files plus `eslint` on one sample package) to confirm nothing broke.
2. Report a table: file → old list → new list, including extensions **added** where they change tool behavior (e.g. enabling ESLint on `md` in the IDE), so each change can be vetoed.
3. List anything flagged as ambiguous/out-of-scope that was left untouched.
