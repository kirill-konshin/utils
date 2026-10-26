# @kirill.konshin/lint

[Vite+](https://viteplus.dev) configuration (Oxlint, Oxfmt, staged checks) — or ESLint + Prettier + lint-staged + Husky without Vite+ — plus AI agent rules & skills for monorepos, in one package.

Upgrading from an older version: use the `lint-migrate` skill (shipped in `skills/`, installed by `lint-prepare`).

## Installation

Recommended, with [Vite+](#vite-recommended):

```bash
$ yarn add -D vite-plus @kirill.konshin/lint @yarnpkg/types
```

Without Vite+, see [ESLint + Prettier](#eslint--prettier-without-vite). `vite-plus` is a required peer either way: the `vitePlus` key of `lint.config.ts` is typed with its config.

Every project whose `packageManager` is Yarn must directly install `@yarnpkg/types`; Yarn PnP does not allow `yarn.config.cjs` to require a transitive dependency (Vite+ does not support PnP anyway).

### PNPM

https://eslint.org/docs/latest/use/getting-started#manual-set-up

```dotenv
auto-install-peers=true
node-linker=hoisted
```

## Yarn constraints

`yarn.config.cjs`:

```js
/** @type {import('@yarnpkg/types')} */
const { defineConfig } = require('@yarnpkg/types');
const { defineYarnConfig } = require('@kirill.konshin/lint/yarn');

module.exports = defineConfig(defineYarnConfig());
```

`defineYarnConfig` reads the root `overrides` and `resolutions`. Each named non-peer dependency in a leaf package must use the root override reference or resolution range; `overrides` wins when both fields name the same package. Nested npm overrides and `$dependency` references are supported.

When the root has no `overrides` field, `@types/node`, `@types/react`, `@types/react-dom`, `next`, `eslint`, `typescript`, and `vite` must each use one range across the workspace. The root declaration wins; otherwise the first leaf path supplies the range. Run `yarn constraints --fix` to apply unambiguous changes.

With Vite+, `vite` is an alias of the Vite+ core and `vitest` is the version Vite+ bundles — pin both at the root:

```json
{
    "devDependencies": { "vite": "npm:@voidzero-dev/vite-plus-core@^1.3.0", "vite-plus": "^1.3.0" },
    "resolutions": { "vite": "npm:@voidzero-dev/vite-plus-core@^1.3.0", "vitest": "5.0.5" }
}
```

`@vitest/*` packages (`coverage-v8`, `web-worker`, …) must match the bundled Vitest exactly (`5.0.5`), or `vp test` refuses to run coverage.

## `.gitignore`

```gitignore
.DS_Store
*.tsbuildinfo
.tscache
.turbo
.nx
.next
build
coverage
dist
dist-*
next-env.d.ts
node_modules
npm-debug*
out
*storybook.log
vite-env.d.ts
yarn-error*
.yarnrc.local.yml

# https://yarnpkg.com/getting-started/qa#which-files-should-be-gitignored
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/sdks
!.yarn/versions
```

List need to be verified, especially `build`, `coverage`, `dist` must be verified not to exclude legit folders. With Vite+ add `.vite-hooks/_` (the generated hook dispatcher).

## `lint.config.ts`

Every project that installs this package has one `lint.config.ts`, in the workspace root (a monorepo has exactly one; packages are never searched). Every entry point reads it: `vitePlusConfig`, `eslintConfig` and `lint-prepare` (which warns while it is missing; the defaults apply until then). Write it by hand (or let an agent write it per the `lint-repo` skill); no tool generates it. The smallest one:

```ts
import { defineLintConfig } from '@kirill.konshin/lint/config';

export default defineLintConfig({});
```

Import from `@kirill.konshin/lint/config` — it loads no ESLint plugin. Node loads the file natively (type stripping, Node ≥ 22.18), so use erasable TypeScript only, and set `"type": "module"` in the root `package.json` (otherwise Node warns on every load).

Toggle notation, the same for every key:

- `undefined` (default) — auto-detect, see [Detection](#detection)
- `true` — force ON (use when detection misses a tool, can be useful to see the error why tool is missing)
- `false` — force OFF, same as `{ enabled: false }`
- `{ /* options */ }` — implies `enabled: true` even if omitted; `enabled: false` turns OFF keeping the other options

```ts
import { defineLintConfig, tsExts } from '@kirill.konshin/lint/config'; // tsExts, scanWorkspace: for globs and file lists

export default defineLintConfig({
    // enabled (default true) = tools are ON unless said otherwise;
    // strict (default false) = same-scope package probes only, no workspace evidence scans
    detection: { enabled: true, strict: false }, // default

    // ON by default; app roots auto-detected (next.config.*, package.json depending on next, src/{app,pages}/);
    // several apps auto-detect as array; pass the package root, not src
    next: { rootDir: 'apps/web' }, // string or array

    storybook: true, // force ON if detection failed
    turbo: false, // force OFF
    nx: true,
    jest: false,
    vitest: { enabled: true },

    // ON by default; auto-detected single entry CSS; explicit path always wins over the scan
    tailwind: { cssConfigPath: 'apps/web/src/app/index.css' },

    // ESLint only
    eslint: {
        defaultIgnore: { importMetaUrl: import.meta.url }, // OFF by default; .gitignore + .prettierignore as ESLint ignores
        typeAware: true, // OFF by default (slow) - see "Type-aware rules"
    },

    // Vite+ only: settings, plus the project's own Vite+ blocks (merged over the defaults, see "Vite+")
    vitePlus: {
        typeAware: false, // ON by default: `vp check` is the type check
        lint: { rules: {}, overrides: [], ignorePatterns: ['generated'] }, // added to the defaults
        fmt: { ignorePatterns: ['generated'] }, // added to the defaults (.idea, .husky, .yarn, OpenSpec files)
        test: { projects: ['packages/*'] }, // any other Vite+ / Vite block passes through
    },

    // skills lint-prepare installs, keyed by source, merged over the defaults (see "AI Agent Rules")
    skills: {
        'expo/skills': false, // a default source, turned off
        'vercel-labs/agent-skills': { skills: { 'vercel-react-native-skills': false } }, // a default source, one skill left out
        'mattpocock/skills': { skills: { tdd: true } }, // an extra source, only this skill
        '@kirill.konshin/lint': { skills: { 'lint-electron': false } }, // this package's own skills
    },

    // package rules by name: false leaves a rule out
    rules: { redux: false },
});
```

Entry points take the same shape as their last argument, merged deep over the file (objects merge, arrays and values are replaced): use it only for per-package differences in a monorepo (e.g. a nested ESLint config).

## Vite+ (recommended)

`vite.config.ts` at the workspace root is always the same — every setting and every project block lives in the `vitePlus` key of [`lint.config.ts`](#lintconfigts):

```ts
import { vitePlusConfig } from '@kirill.konshin/lint/vite-plus';
import { defineConfig } from 'vite-plus';

export default defineConfig(vitePlusConfig());
```

`vitePlusConfig` returns the `lint` (Oxlint), `fmt` (Oxfmt) and `staged` blocks plus the project blocks as a `Promise`; `defineConfig` from `vite-plus` awaits it. Its optional arguments (`vitePlusConfig(config, overrides)`: Vite+ blocks, then `lint.config.ts` overrides) are for exceptions only.

- Merging: lists add up (`plugins`, `jsPlugins`, `overrides`, `ignorePatterns`), maps merge by key (`rules`, `settings`, `env`), a `staged` block replaces the default
- Building blocks are exported: `lintConfig(config)` (synchronous, takes a resolved config), `fmtConfig()`, `stagedConfig()`
- Lint and format settings live in the **root** config only: Vite+ ignores nested `lint`/`fmt` blocks, use `lint.overrides` / `fmt.overrides` with workspace paths
- `.gitignore` and `.prettierignore` are honoured by Oxfmt; the recommended `.prettierignore` entries are default `fmt.ignorePatterns`, add others there

What maps where:

<table>
  <thead>
    <tr><th>Before</th><th>Vite+</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>ESLint recommended sets (JS, TS, React, jsx-a11y, Next, import, promise)</td>
      <td>Oxlint <code>correctness</code> category + the same overrides, rule by rule</td>
    </tr>
    <tr>
      <td><code>react-hooks</code></td>
      <td>Oxlint <code>react/*</code> (incl. React Compiler rules)</td>
    </tr>
    <tr>
      <td><code>unused-imports</code></td>
      <td><code>no-unused-vars</code> with import autofix</td>
    </tr>
    <tr>
      <td><code>simple-import-sort</code></td>
      <td>Oxfmt <code>sortImports</code> (same groups)</td>
    </tr>
    <tr>
      <td>Storybook, Tailwind, Turbo, <code>@nx/*</code>, <code>local/test-colocation</code></td>
      <td>Oxlint JS plugins, loaded from this package</td>
    </tr>
    <tr>
      <td>Prettier</td>
      <td>Oxfmt <code>fmt</code> (same options)</td>
    </tr>
    <tr>
      <td>lint-staged</td>
      <td><code>staged</code>: one <code>vp check --fix</code></td>
    </tr>
    <tr>
      <td>Husky</td>
      <td><code>vp config</code> hook dispatcher, <code>.vite-hooks/pre-commit</code></td>
    </tr>
  </tbody>
</table>

Not carried over: `@nx/dependency-checks` (Oxlint does not lint JSON), `@typescript-eslint/naming-convention` (type-aware only, off by default). `@nx/eslint-plugin` needs the `eslint` package installed (as a library; ESLint itself does not run). Oxlint type-aware linting and type checking (tsgolint, the TypeScript 7 engine) are on by default — `vp check` is the type check, `vp pack` does not type-check; `vitePlus: { typeAware: false }` turns them off. tsgolint rejects tsconfig options TypeScript 7 removed (`target: es5`, `moduleResolution: node`, `downlevelIteration`).

`package.json`:

```jsonc
{
    "scripts": {
        "postinstall": "lint-prepare init && vp config", // this order: vp config fills the Vite+ section lint-prepare writes; `prepare` for published roots, see npm-yarn rule
        "lint": "vp check --fix",
        "lint:staged": "vp staged",
        "build": "vp run -r build", // every workspace package, in dependency order
        "start": "vp run -r --parallel start",
    },
}
```

WebStorm: the Oxc plugin (`.idea/externalDependencies.xml`, `OxcSettings.xml`, `OxfmtSettings.xml`) with Prettier disabled — templates in the `lint-webstorm` skill.

`.vite-hooks/pre-commit`:

```sh
vp staged
```

`vp config` installs the hook dispatcher and fills the Vite+ agent instructions into the `<!--VITE PLUS START-->` section `lint-prepare` writes into `AGENTS.md` — so it runs after `lint-prepare` (`vp config` never creates the section itself; `vp migrate --agent` would, but also rewrites dependencies). A `core.hooksPath` left by Husky blocks it: `git config --unset core.hooksPath` once. CI runs `vp check` (no `--fix`).

Library packages build with `vp pack` from a `pack` block (tsdown) in their own `vite.config.ts`, and test with `vp test`; tests import from `vite-plus/test`.

## Editor Config `.editorconfig`

Oxfmt reads it too; `fmtConfig()` sets the Prettier behaviors that differ from it.

```editorconfig
root = true

[*]
indent_style = space
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = false
max_line_length = 120

[*.md]
max_line_length = 99999

[*.{js,jsx,ts,tsx,cjs,cts,mjs,mts,md,mdx,htm,html,vue}]
indent_size = 4

[*.{css,scss,sass,less,yml,yaml,json,json5,graphql,graphqls,xml}]
indent_size = 2

[Makefile]
indent_style = tab
```

## ESLint + Prettier (without Vite+, legacy, not recommended)

```bash
$ yarn add -D eslint prettier vite-plus @kirill.konshin/lint @yarnpkg/types husky lint-staged
```

### `.prettierignore`

Create `.prettierignore` file:

```gitignore
.idea
.husky
.yarn

# OpenSpec writes these; they stay exactly as `openspec update` leaves them
.agents/skills/openspec-*
.claude/skills/openspec-*
.claude/commands/opsx
```

https://prettier.io/docs/ignore:

> Prettier will also follow rules specified in the ".gitignore" file if it exists in the same directory from which it is run.

### ESLint

`eslint.config.mjs`:

Every tool integration — Next.js, Nx, Turborepo, Storybook, Jest, Vitest, Tailwind — is auto-detected (the detection results are exported as `has*` booleans for debugging). Settings come from [`lint.config.ts`](#lintconfigts); `eslintConfig(overrides)` merges its argument over them:

```js
import { defineConfig } from 'eslint/config';
import { eslintConfig } from '@kirill.konshin/lint';

// every tool integration auto-detected, settings from lint.config.ts
export default defineConfig(await eslintConfig());
```

`eslintConfig` returns a `Promise` (natively awaited by ESLint), to compose with your own blocks, `await` it:

```js
import { defineConfig } from 'eslint/config';
import { eslintConfig, includeIgnoreFile } from '@kirill.konshin/lint';

export default defineConfig([
    ...(await eslintConfig({ eslint: { defaultIgnore: { importMetaUrl: import.meta.url } } })),
    {
        name: 'Custom rules',
        rules: {
            // overrides
        },
    },
    includeIgnoreFile(import.meta.url, '.customignore'), // extra ignore files beyond defaultIgnore
]);
```

#### Type-aware file list

`eslint.typeAware` takes the typescript-eslint project service options:

```ts
import { defineLintConfig, scanWorkspace } from '@kirill.konshin/lint/config';

export default defineLintConfig({
    eslint: {
        // OFF by default (slow) - see "Type-aware rules"
        typeAware: {
            allowDefaultProject: scanWorkspace('{vite,vitest}.config.ts'), // no default; absolute paths are relativized; ** globs are not supported
            maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 50, // defaults to the list length, (default 8), set it explicitly only when supplying multi-match globs
            tsconfigRootDir: process.cwd(), // defaults to the detected workspace root
        },
    },
});
```

#### Per-package configs (monorepo)

ESLint 10 resolves the config **per linted file**: the nearest `eslint.config.mjs` up the tree wins **entirely** (no cascading/inheritance of rules). For full per-app Next/Tailwind linting in a multi-app monorepo, give each app its own config — either inherit the root and add overrides, `apps/web/eslint.config.mjs`:

```js
import { defineConfig } from 'eslint/config';

import rootConfig from '../../eslint.config.mjs';

export default defineConfig([...(await rootConfig), { rules: { 'tailwindcss/no-custom-classname': 'off' } }]);
```

…or call `eslintConfig` again with the overrides this app needs, `apps/web/eslint.config.mjs`:

```js
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'eslint/config';
import { eslintConfig } from '@kirill.konshin/lint';

export default defineConfig(
    await eslintConfig({
        detection: { enabled: false, strict: true }, // fully explicit: this config only sees its own scope
        // do not use workspace-wide auto-scan, provide exactly ONE from THIS leaf package
        tailwind: { cssConfigPath: fileURLToPath(new URL('src/app/index.css', import.meta.url)) },
    }),
);
```

⚠️ Nearest-wins means root-only blocks (e.g. custom rules) do NOT apply to the subtree unless inherited or re-declared.

[Detection](#detection) runs against the **workspace root** even from a nested config, so per-app tool settings (`cssConfigPath`) should be explicit absolute paths — relative ones depend on the lint cwd.

The Tailwind block auto-scopes to the **workspace package** owning the entry CSS (emitted as the block's `basePath`), so a single root config doesn't flag class-like strings in non-Tailwind packages; pass `tailwind: { scoped: false }` to apply it workspace-wide (no-op when the entry is owned by the workspace root itself).

### Prettier `.prettierrc.mjs`

```js
import { prettier } from '@kirill.konshin/lint/prettier';
export default prettier;
```

or

```js
import { prettier } from '@kirill.konshin/lint/prettier';

export default {
    ...prettier,
    // overrides
};
```

Import from `/prettier`, not the package root: the root loads every ESLint plugin, which would slow down each Prettier run.

### `package.json` (legacy for ESLint / Husky / Lint Staged)

```jsonc
{
    "scripts": {
        "eslint": "eslint --fix --concurrency=auto --cache --cache-location node_modules/.cache/eslint", // to see files use --debug
        "prettier": "prettier --write --log-level=warn --ignore-path .gitignore --ignore-path .prettierignore", // to see files use --log-level=log
        "lint": "yarn eslint . && yarn prettier .",
        "lint:staged": "lint-staged",
    },
}
```

### IDEA settings

- Eslint: `**/*.{js,jsx,ts,tsx,cjs,cts,mjs,mts,md,mdx,htm,html,vue}`
- Prettier: `{**/*,*}.{js,jsx,ts,tsx,cjs,cts,mjs,mts,md,mdx,htm,html,vue,css,scss,sass,less,yml,yaml,json,json5,graphql,graphqls,xml}`

### Lint Staged (legacy, see VitePlus)

`.lintstagedrc.mjs`

```js
import { listStaged } from '@kirill.konshin/lint/lint-staged';
export default listStaged;
```

Import from `/lint-staged`, not the package root, for the same reason as `/prettier`. Tasks run the `eslint` / `prettier` scripts above through `node --run` (Node ≥ 22, `node_modules` linker), not `yarn`, which loads the whole project state before every script.

### Husky

By default, always use the `prepare` script, as [Husky recommends](https://typicode.github.io/husky/get-started.html) — it never runs on consumers' installs of a published package, so it needs no guards. The bare `husky` command (v9+; `husky install` is the deprecated v8 form) installs the git hooks:

`package.json`:

```json
{
    "scripts": {
        "prepare": "lint-prepare init && husky && next types"
    }
}
```

> ⚠️ `next types` is optional and should only be added if project uses Next.js typed routes, as additional measure, types will be generated anyway

> ⚠️ Yarn 2+ (Berry) skips top-level `prepare` on install ([lifecycle scripts](https://yarnpkg.com/advanced/lifecycle-scripts)) — run `yarn prepare` yourself / in CI. For a **private** root, prefer `postinstall`: Yarn does run it on install, so hooks land automatically (incl. CI) with no manual step and no [pinst](https://github.com/typicode/pinst) guard. Keep `prepare` for **published** packages — an unguarded `postinstall` would run on consumers' installs.

`.husky/pre-commit`:

```bash
#!/bin/zsh
node --run lint:staged
```

Run scripts with `node --run` and tools directly (Husky puts `node_modules/.bin` on `PATH`): a `yarn` hop costs seconds.

Note `source ~/.zshrc # for VSCode terminal` may be added for VSCode terminal that is not aware of ZSH. Do not add unless specifically asked, and remove if present.

## AI Agent Rules

The package also ships a standardized set of coding conventions (`rules/*.md`) and skills for AI coding assistants, wired into a repo by the `lint-prepare` CLI.

### Manual Setup (`lint-prepare` CLI) w/o prepare or postinstall

```bash
# Initialize (skips if AGENTS.md exists and wasn't generated by this tool)
lint-prepare init

# Force update AGENTS.md
lint-prepare update
```

### Customization

The generated `AGENTS.md` has a `# Custom Rules` section at the bottom — add project-specific rules there; they're preserved across updates.

### How it works

In the project root, `lint-prepare`:

- Creates real `rules/` and `skills/` directories in `.agents/` (canonical, cross-tool — Codex reads it) and `.claude/` (Claude Code).
- Links every `rules/*.md` file into both, except the ones the `rules` map of [`lint.config.ts`](#lintconfigts) turns off (`rules: { redux: false }`). Links point straight at the installed package's real location (`node_modules/@kirill.konshin/lint`, or the workspace package). A rule of yours with the same name in `.agents/` wins, the package one is not installed.
- Installs the skills of the `skills` map of `lint.config.ts`, merged over the defaults, with the [`skills` CLI](https://github.com/vercel-labs/skills), into `.agents/skills/` and from there into `.claude/skills/`. The map is keyed by source, each value uses the toggle notation; `skills: { name: true | false }` picks skills of a source — with no `true` entry every skill except the `false` ones:
    - npm packages (`@scope/name`, or a name without `/`) are dependencies that ship skills: `skills experimental_sync -y -a codex claude-code` links every `skills/<name>/` folder of your dependencies; the map only leaves some out (`--exclude`). Default: this package's own skills (`'@kirill.konshin/lint': true`) — e.g. `lint-repo`, which sets up the tooling above and audits the repo against the rules.
    - Git sources (`owner/repo`) are installed with `skills add`, at `ref` when set (pin a full 40-character commit SHA). A source whose skills `skills-lock.json` already has at the same ref is not fetched again. `lint.config.ts` owns the remote skills of `skills-lock.json`: a remote skill it no longer lists is removed (`skills remove`).
    - Defaults — every project gets them, turn off what it does not need: the [Core Pack](https://skills.sh/p/DxVN7q53wGdAcZQt) (`vercel-labs/agent-skills` incl. `web-design-guidelines`, `vercel/ai`, `shadcn-ui/ui`, `heroui-inc/heroui`, `mui/material-ui` without `material-ui-tailwind`, `neondatabase/agent-skills`) and the official skills of the libraries the rules cover (`vercel/next.js`, `reduxjs/redux-toolkit`, `vercel/turborepo`, `nrwl/nx-ai-agents-config`, `expo/skills`, `microsoft/playwright-cli`). Each source lists its skills and pins a commit: `DEFAULT_LINT_CONFIG` in `src/config.ts`.
    - A skill folder of yours with the same name in `.agents/skills/` wins.
    - A failed CLI run is a warning, the install goes on: run `lint-prepare` again.
    - On CI (`CI` set) nothing remote is fetched (`--no-remote`, no `skills add`): no network needed.
    - Telemetry is off (`DISABLE_TELEMETRY=1`) unless you set it.
    - It writes `skills-lock.json`: add it to `.gitignore`, `lint-prepare` creates it again on every install.
    - A personal skill (`~/.claude/skills`) overrides a project skill with the same name in Claude Code.
- Mirrors your own top-level entries from `.agents/{rules,skills}/` into `.claude/`. Commands are not synced: make them skills.
- Removes dead links (e.g. after renaming a file) and the links it placed before but no longer needs, including what older versions placed (skill links, `commands/`). Each directory gets a generated `.gitignore` listing its links and the skills the `skills` CLI installed, so your own entries stay tracked.
- Writes an empty marker pair for each section another tool owns into the generated `AGENTS.md` — currently Vite+ (`<!--VITE PLUS START-->`). The tool fills it, so run it **after** `lint-prepare` in the same install script (`lint-prepare init && vp config`): tools write their own agent content, nothing is copied by hand.
- Generates `AGENTS.md` for other assistants (Codex, Cursor, Copilot, …) with a `# Rules` section — one entry per rule (the package's and yours): its title, frontmatter `description`, the `paths` it is scoped to and a plain link to its `.agents/rules/<file>` entry — and symlinks `CLAUDE.md` to it. The links are never `@` imports: Claude Code loads `.claude/rules` itself and honours each rule's `paths`, while an import would load every rule into every session.

### OpenSpec

For a repository specified with [OpenSpec](https://github.com/Fission-AI/OpenSpec) the package ships one bin, `spec-tools` — a single self-contained file, `skills/spec-tools/scripts/cli.js` — four skills:

- `spec-tools steward` and the `spec-steward` skill — the corpus gate (citations, binding, the scenario ratchet), the edit hook, corpus-quality audits and review rounds.
- `spec-tools` and its skill — the change gates, the workflow-evidence gate, the requirement-level specification diff, the code-conformance audit, and the glue a CI pipeline runs around a headless AI review (verdict gate, merge-request comment, HTML reports).
- `spec-verify` — the skill every audit worker loads.
- `spec-author` — the skill that writes or edits a specification in place, the default direct-edit path (`/spec-author`).

Which to reach for:

<table>
  <thead>
    <tr><th>Question</th><th>Tool</th><th>Outcome</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>How do I write or change a rule?</td>
      <td><code>/spec-author</code></td>
      <td>The specification edited in place, with the code and tests that prove it</td>
    </tr>
    <tr>
      <td>Do citations resolve, is every new scenario bound, did a rule weaken?</td>
      <td><code>spec-tools steward check</code> (the gate, the edit hook)</td>
      <td>Fails the merge request on an error</td>
    </tr>
    <tr>
      <td>Are these the right rules — placement, REQUIRED or ⚠️ ADVISORY, wording, evidence, duplicates, drift across repositories?</td>
      <td>the <code>spec-steward</code> skill (audit on the <code>spec-tools</code> engine, review rounds, align)</td>
      <td>A review file of proposals; the owner decides, steward applies; never a build failure</td>
    </tr>
    <tr>
      <td>Does the code satisfy the intent of the rules, and do the bound tests assert them?</td>
      <td>the <code>spec-verify</code> skill, run by <code>spec-tools</code></td>
      <td>Graded, quote-proved findings; PASS / FAIL / INCOMPLETE gates CI</td>
    </tr>
    <tr>
      <td>Is the change finished, what did it change, how does CI run the audit?</td>
      <td><code>spec-tools</code> (gates, evidence, diff, tier, workers, verdict, comment, html)</td>
      <td>Gates and reports for the pipeline</td>
    </tr>
  </tbody>
</table>

Where each runs:

<table>
  <thead>
    <tr><th>What</th><th>In CI</th><th>Locally</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><code>spec-tools steward check</code></td>
      <td><code>spec-tools gates</code>, every merge request: an error fails it</td>
      <td>the edit hook on every edit Claude makes, and <code>spec-tools gates</code> before handing back</td>
    </tr>
    <tr>
      <td><code>spec-tools steward coverage</code>, <code>spec-tools steward evidence --json</code></td>
      <td>the coverage report, and the evidence <code>spec-tools scope</code> builds the spec-verify audit from</td>
      <td>on demand</td>
    </tr>
    <tr>
      <td>spec-steward's corpus audit, review rounds, <code>align</code></td>
      <td>never — it is heavy and its outcome is the owner's</td>
      <td>on the owner's request: <code>spec-tools audit --audit spec-steward [--context &lt;decisions file&gt;]</code>, then the review rounds, where the accepted answers are applied</td>
    </tr>
    <tr>
      <td><code>spec-verify</code></td>
      <td>one audit job — the reading, then the judging: its verdict gates merge requests and the release</td>
      <td><code>spec-tools audit</code>, and <code>/spec-verify changed</code> before handing back a spec edit</td>
    </tr>
    <tr>
      <td><code>spec-tools gates</code>, <code>evidence</code>, <code>diff</code></td>
      <td>their own jobs</td>
      <td>before handing back</td>
    </tr>
  </tbody>
</table>

Specifications change only by hand, or when the steward skill applies the owner's accepted review answers; `spec-tools steward check --fix` makes the only mechanical repairs. No audit edits code or specifications.

The audits share one set of judging rules, `skills/spec-tools/references/rules/`: each finding gets a severity and a confidence (0–100) from its reader and, when it is severe and sure enough, from a judge; the merge fuses the two readings and its thresholds give the tier. An ERROR is a demonstrated defect with a production effect (a broken flow, a contract or invariant violation, a sensitive-data leak, a performance problem): severity 70 or more at a confidence above 70%, by default. The thresholds and the judge gate are `AUDIT_SEVERITY_*`, `AUDIT_CONFIDENCE_*` and `AUDIT_JUDGE_*` variables; the affected set of a merge request or a push is tuned by `AUDIT_AFFECTED_*` (the `spec-tools` contract). `spec-verify`'s checks 2–5 are spec-steward's items 10, 9, 11 and 5, worded identically — steward asks whether the rule should change, `spec-verify` whether the code or the rule has diverged. Every file the tools write is under `.spec-audit/`, as YAML; Markdown only as the final report.

Setup and the GitLab pipeline are in the `spec-tools` skill.

### Safety checks

Only the files `lint-prepare` knows (package files and mirrors of yours) and dead links are touched: real files are never overwritten (e.g. your own `.claude/rules/*.md`) and nothing is written through a symlinked directory. `.codex/` is not touched: Codex reads `.agents/skills` and `AGENTS.md`, and the links earlier versions placed in `.codex/` stay until you delete them. `init`/`update` refuse to run if `CLAUDE.md` isn't a symlink. If `AGENTS.md` exists and wasn't generated by this tool, `init` skips it; use `update` to force regeneration.

## Migration

Upgrading between minor versions: the `lint-migrate` skill, one section per version step. 0.7 → 0.8 in short:

- One [`lint.config.ts`](#lintconfigts) in the workspace root holds every setting, `"type": "module"` in the root `package.json`; the entry points take overrides only
- ESLint: `defineLintConfig(options)` → `eslintConfig(overrides)`; `typeAware` and `defaultIgnore` → the `eslint` key
- Vite+: `vite.config.ts` becomes `defineConfig(vitePlusConfig())`; its blocks (`lint`, `fmt`, `test`, …) and toggles move into `lint.config.ts`, `typeAware` and the blocks under the `vitePlus` key; `vitePlusConfig` is now async
- Skills: the root `package.json` `skills` field → the `skills` map of `lint.config.ts`; package rules can be turned off with the `rules` map
- `vite-plus` is a required peer, also without Vite+ (it types `lint.config.ts`)

## Development

### Build

`vp pack` (tsdown, the `pack` block of `vite.config.ts`) builds two things: the library — ESM and declarations from `src/*.ts`, one file per module, plus the CommonJS Yarn entry from `src/yarn.cts` — into `dist`, and the `spec-tools` CLI — spec-steward included — into one self-contained file, `skills/spec-tools/scripts/cli.js`, which the skills and CI jobs name. The root `vp check` checks types (type-aware Oxlint, the TypeScript 7 engine); the build does not. Consumers load `dist`, and this monorepo builds lint first in its root `postinstall` before running `lint-prepare`.

### ESLint and Vite+ configs

`src/config.ts` is the `lint.config.ts` schema, its defaults and its loader (the `./config` entry, no ESLint plugin). `src/gates.ts` holds every tool gate once; the ESLint blocks and `src/vitePlus.ts` both call it. `src/vitePlus.ts` reuses the conventions (`src/conventions.ts`) of the ESLint blocks and imports no ESLint plugin: it references the JS plugins by resolved path. `src/oxlintPlugin.ts` is the Oxlint JS plugin with the custom rules.

Declarations are generated from the TypeScript source and retain the underlying package types — `Linter.Config`, Tailwind plugin settings, Prettier `Config`, and lint-staged `Configuration`.

**Every** block lives in a themed `src/configs/*.ts` file and is exported as a standalone function for manual composition (and easy testing/mocking), in the order `eslintConfig` applies them: `baseConfig` (JS recommended + global ignores + globals + core-rule overrides), `defaultIgnoreConfig`, `reactConfig` (the whole React family, see below), `prettierConfig`, `storybookConfig`, `typeAwareConfig` (off by default; ordered before the import blocks so its naming-convention rule loses to the default-export relaxation), `importXConfig` (includes the default-export relaxation for conventional files), `importSortConfig`, `unusedImportsConfig`, `promiseConfig`, `unicornConfig`, `turboConfig`, `tailwindConfig`, `nxConfig`, `jestConfig`, `vitestConfig`, `testConfig`.

Tool-gated functions take the same value as their `lint.config.ts` key and gate themselves (`tailwindConfig(true)`, `nxConfig(false)` → `[]`, `tailwindConfig({ cssConfigPath })`). `reactConfig(nextFlag, strict)` is the whole family in its load-bearing order — Next is just a shortcut to an opinionated React/TypeScript setup, so the TS wiring, overrides and settings apply no matter whether Next or plain React won: `nextConfig` (chooser: `nextBaseConfig` when Next is enabled, `reactBaseConfig` fallback otherwise) → `typescriptOverridesConfig` → `nextOverridesConfig` → `reactSettingsConfig` — all exported individually too.

### Detection

Due to limitations package visibility between leaf and root this package has to be creative to support config-free detection.

1. **Package probe** — `local-pkg`'s `isPackageExists` anchored at the **workspace root**, the same scope the plugins resolve from at lint time (`has<Pkg>` exported for debugging).
2. **Evidence scan** — tool config files across the workspace: the root directory plus every **workspace package** (the real `workspaces`/`pnpm-workspace.yaml` globs via `@manypkg/get-packages`, not a depth heuristic), skipping dot dirs, build outputs, and `.gitignore`d files; exported as `scanWorkspace`. All scans of a process share one filesystem cache, so each directory is read once. Catches tools installed only in **leaf** packages, invisible to the probe (1). The workspace root itself comes from env (`PROJECT_CWD`/`npm_config_local_prefix`) with `@manypkg/find-root` as the fallback (workspace manifest walk, nearest `package.json` for single-package repos; exported as `findWorkspaceRoot`), so linting from inside a package still sees the whole repo.
3. **Hoisting, not bridging** — the plugins need the tool's package resolvable from the workspace root; a tool that is evidently in use (2) but not resolvable there (1) is a **hard error** with hoisting guidance (keep default hoisting, pnpm `public-hoist-pattern`, or a root devDependency — see the error text) instead of a silent skip or a cryptic plugin crash. Fix it once in the package manager config; nothing is symlinked at lint time.
4. **Yarn Berry PnP** — there is no hoisting to configure; declare the tools at the workspace root as well, keeping versions in sync with the leaves (e.g. the `"vitest": "$vitest"` version-alias hack); `next` documents its own monorepo ESLint setup.

<table>
  <thead>
    <tr><th>Option</th><th>Package</th><th>Evidence glob</th><th>When zero / many found</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><code>tailwind</code></td>
      <td><code>tailwindcss</code>¹</td>
      <td><code>*.css</code> with <code>@import "tailwindcss"</code></td>
      <td>needs exactly <strong>one</strong>: zero → off (forced → error), several → <strong>always</strong> error; set <code>cssConfigPath</code></td>
    </tr>
    <tr>
      <td><code>next</code></td>
      <td><code>next</code>¹</td>
      <td><code>next.config.*</code>, <code>package.json</code> depending on <code>next</code>, <code>src/{app,pages}/</code> dir</td>
      <td>zero → no <code>rootDir</code> (optional); many → all as array; or set <code>rootDir</code> (the package root, not <code>src</code>)</td>
    </tr>
    <tr>
      <td><code>storybook</code></td>
      <td><code>storybook</code>¹</td>
      <td><code>.storybook/main.*</code></td>
      <td>presence is enough</td>
    </tr>
    <tr>
      <td><code>jest</code></td>
      <td><code>jest</code>¹</td>
      <td><code>jest.config.*</code></td>
      <td>presence is enough</td>
    </tr>
    <tr>
      <td><code>vitest</code></td>
      <td><code>vitest</code>¹</td>
      <td><code>{vitest,vite}.config.*</code></td>
      <td>presence is enough</td>
    </tr>
    <tr>
      <td><code>nx</code></td>
      <td>(plugin bundled)</td>
      <td><code>nx.json</code> at the workspace root</td>
      <td>—</td>
    </tr>
    <tr>
      <td><code>turbo</code></td>
      <td><code>turbo</code></td>
      <td>package probe only</td>
      <td>—</td>
    </tr>
  </tbody>
</table>

¹ the plugins need the tool's package resolvable at lint time (`tailwindcss` for the theme-loading workers, `next` for `eslint-config-next`'s internal `require`s, `storybook` for its plugin's static import, `jest` for version sniffing) — resolvable from the workspace root, or the hard error of step 3 fires.

`vitePlusConfig` runs the same gates (`src/gates.ts`, shared with the ESLint blocks), with three differences: Oxlint JS plugins load from this package, so only `storybook` (its plugin imports `storybook`) and `nx` (needs `eslint`) demand a resolvable package; `vitest` is ON unless set to `false` (Vite+ bundles it); `next` needs no package (Oxlint's `nextjs` plugin is native). `typeAware` differs by backend: `eslint.typeAware` is OFF by default (slow), `vitePlus.typeAware` ON.

The machinery is controlled by the `detection` key of `lint.config.ts` (same toggle notation as the tools):

- `detection: false` — tools are OFF unless explicitly enabled; enabled tools still auto-detect their settings (step 2)
- `detection: { strict: true }` — only step 1 runs: the `has*` package probes **are** the strict detection — no workspace evidence scans (2). Mandatory settings (`cssConfigPath`) must then be explicit, and `nx.json` is checked at **cwd** instead of the workspace root (`hasNx` is the only non-package `has*`)
- `detection: { enabled: false, strict: true }` — fully explicit: tools on only when set, probes only

Set `LINT_DEBUG=1` to trace the machinery: `has*` probe results, every workspace scan (glob, root, files found) and each tool's gate verdict (supplied options, absolutized & scanned evidence files, effective enabled status + reason).

> `basePath: 'packages/xxx'` (ESLint ≥ 9.30) can scope a config object to a directory within a single root config, but it won't help with detection — `eslintConfig` detects once, workspace-wide (e.g. Tailwind still demands exactly one entry CSS), so per-app settings would still have to be spelled out block by block; nested configs are the cleaner tool for this.

### Type-aware rules (optional, disabled by default for performance)

Config files living outside any tsconfig `include` (`vite.config.ts`, `.storybook/main.ts`, …) need typescript-eslint's `allowDefaultProject` — it has **no default** here, and upstream forbids `**` in its patterns, so either spell out each directory level or generate the exact file list with the exported `scanWorkspace` (workspace-root-anchored, `.gitignore`- and build-output-aware; its absolute paths are relativized against `tsconfigRootDir` automatically):

### AI Rule file format

```yaml
---
type: always_apply # or agent_requested
description: Set of rules for projects which use Xxx # Required for agent_requested
paths:
    - '**/*.xxx'
---
```

## Issues

- Package managers
    - [ ] TODO verify the package end-to-end (workspace-root detection, Tailwind / `next.config.*` scans, `has*` capability probes, plugin resolution, `eslintConfig` under a real lint run) with each manager:
        - [x] Yarn Berry, node-modules linker — this repo, fully covered
        - [ ] Yarn Berry **PnP** — root-declared `tailwindcss` verified working (see "Detection" step 4); full config run (plugin loading, capability probes) unverified since the switch to `@manypkg/find-root`/`local-pkg`
        - [ ] Yarn 1 (classic) — root detection now delegates to `@manypkg/find-root` (workspace-manifest walk); unverified since the switch
        - [ ] pnpm — root detection via `@manypkg/find-root` (`pnpm-workspace.yaml`); `public-hoist-pattern` guidance unverified in a real pnpm workspace
        - [ ] npm — env fast-path (`npm_config_local_prefix`) verified previously; `@manypkg/find-root` fallback unverified since the switch
    - [x] Yarn [constraints](https://yarnpkg.com/features/constraints) helper enforces root overrides/resolutions or default dependency consistency
- ESLint 9
    - [x] https://github.com/microsoft/rushstack/issues/4635 Failed to patch ESLint because the calling module was not recognized
    - [x] https://github.com/microsoft/rushstack/issues/4965 Failed to patch ESLint because the calling module was not recognized
- ESLint 10
    - [ ] https://github.com/vercel/next.js/issues/89764 TypeError: Error while loading rule 'react/display-name': contextOrFilename.getFilename is not a function
    - [x] `import/no-default-export` (`eslint-plugin-import@2.32.0`) crashes every lint run under ESLint 10's flat config - its `sourceType()` helper reads `context.parserOptions`, which is `undefined` (not `{}`) there. Worked around by registering `eslint-plugin-import-x` (a drop-in replacement) under its own `import-x` key - see the `eslint-plugin-import-x` block in `index.js` - since ESLint 10 hard-errors ("Cannot redefine plugin") if you try to reuse the `import` key `eslint-config-next` already registers. The enforced rule is therefore `import-x/no-default-export`, not `import/*`.

## License

MIT
