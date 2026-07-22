# @kirill.konshin/lint

ESLint + Prettier + lint-staged + Husky configuration, plus AI agent rules & skills for monorepos — in one package.

## Installation

```bash
$ yarn add -D eslint prettier @kirill.konshin/lint husky lint-staged
```

### PNPM

https://eslint.org/docs/latest/use/getting-started#manual-set-up

```dotenv
auto-install-peers=true
node-linker=hoisted
```

## ESLint / Prettier / lint-staged / Husky

### Settings

`eslint.config.mjs`:

```js
import { defineLintConfig } from '@kirill.konshin/lint';

export default defineLintConfig(); // every tool integration auto-detected
```

Every tool integration — Next.js, Nx, Turborepo, Storybook, Jest, Vitest, Tailwind — is auto-detected (the detection results are exported as `has*` booleans for debugging). Pass options (JSDoc-typed, see `LintOptions` in `index.js`) to force any of them on/off or to supply tool-specific settings:

```js
export default defineLintConfig({
    defaultIgnore: { importMetaUrl: import.meta.url }, // .gitignore + .prettierignore as ESLint ignores
    next: { rootDir: 'path/to/next-app' }, // an options object means ON + settings; auto-detected when omitted
    tailwind: true, // force ON when detection misses it
    turbo: false, // force OFF
});
```

- `undefined` (default) — auto-detect
- `true` or an options object — force ON. Detection probes resolve from this package's install location, so in a monorepo where a tool lives only in **leaf** packages (not the root `package.json`) detection can miss it — force the flag in that case
- `false` — force OFF
- in the object form `enabled` defaults to `true` — providing options implies turning the tool on; set `enabled: false` to force OFF while keeping the other options in place (e.g. `tailwind: { enabled: false, cssConfigPath: '...' }`)

`defaultIgnore` and `typeAware` have nothing to auto-detect, so they are OFF unless set. `defaultIgnore` converts the `.gitignore` and `.prettierignore` sitting next to your config file (both must exist) into ESLint ignores — it needs your `import.meta.url`, so `defaultIgnore: true` alone is a hard error.

`next.rootDir` is auto-detected when omitted: the directories containing a `next.config.*`. None found → the setting is simply left out (it's optional); several apps → all of them as an array.

All file scans (Tailwind entry, `next.config.*`) and `nx.json` detection are anchored to the **workspace root**, not cwd — linting from inside a package (lint-staged, IDE, `yarn workspace x lint`) still sees the whole repo. The root is detected by asking the package manager (env: Yarn Berry `PROJECT_CWD`, npm `npm_config_local_prefix`; CLIs: `pnpm root -w`, Yarn Berry via `yarn node`, `npm prefix`), falling back to a lockfile walk bounded by `.git`; `findWorkspaceRoot` is exported for debugging alongside the `has*` flags. Yarn 1 (classic) provides neither a root env nor a root command — classic workspaces resolve via `npm prefix` (same package.json `workspaces` field) or the yarn.lock walk.

Options can also be produced by a (possibly async) function: `defineLintConfig(() => ({ tailwind: true }))`.

`defineLintConfig` returns a `Promise` — ESLint natively awaits a Promise default export, so the plain form above just works. To compose with your own blocks, `await` it:

```js
import { defineLintConfig, includeIgnoreFile } from '@kirill.konshin/lint';

export default [
    ...(await defineLintConfig({ defaultIgnore: { importMetaUrl: import.meta.url } })),
    {
        name: 'Custom rules',
        rules: {
            // overrides
        },
    },
    includeIgnoreFile(import.meta.url, '.customignore'), // extra ignore files beyond defaultIgnore
];
```

**Every** block lives in a themed `configs/*.js` file and is exported as a standalone function for manual composition (and easy testing/mocking), in the order `defineLintConfig` applies them — blocks from the same file stay consecutive, which matters inside a family (Next: base config → the TS wiring stemming from it → overrides → settings): `baseConfig` (JS recommended + global ignores + globals + core-rule overrides), `defaultIgnoreConfig`, `nextConfig`, `typescriptOverridesConfig`, `nextOverridesConfig`, `reactSettingsConfig`, `prettierConfig`, `storybookConfig`, `typeAwareConfig` (off by default — see [Type-aware rules](#type-aware-rules); ordered before the import blocks so its naming-convention rule loses to the default-export relaxation), `importXConfig` (includes the default-export relaxation for conventional files), `importSortConfig`, `unusedImportsConfig`, `promiseConfig`, `unicornConfig`, `turboConfig`, `tailwindConfig`, `nxConfig`, `jestConfig`, `vitestConfig`, `testConfig`.

Tool-gated functions take the same value as their `defineLintConfig` flag and gate themselves (`tailwindConfig(true)`, `nxConfig(false)` → `[]`, `tailwindConfig({ cssConfigPath })`). `nextConfig` is a composite: `nextBaseConfig` (the pure Next blocks, also exported) when Next is enabled, the `reactConfig` fallback otherwise — both are exported for direct use too.

The package ships hand-written types (`index.d.ts`) that pull real types from the underlying packages — `Linter.Config` from `eslint`, `PluginSettings` from `eslint-plugin-tailwindcss`, `prettier`'s `Config`, `lint-staged`'s `Configuration` — so `defineLintConfig` options and all exports are fully typed in `eslint.config.mjs` (via editor inference) and `eslint.config.ts`.

`.prettierrc.mjs`:

```js
import { prettier } from '@kirill.konshin/lint';
export default prettier;
```

or

```js
import { prettier } from '@kirill.konshin/lint';

export default {
    ...prettier,
    // overrides
};
```

`.editorconfig`

```editorconfig
root = true

[*]
indent_style = space
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = false

[*.{js,jsx,ts,tsx,cjs,cts,mjs,mts,md,mdx,htm,html,vue}]
indent_size = 4

[*.{css,scss,sass,less,yml,yaml,json,json5,graphql,graphqls,xml}]
indent_size = 2

[Makefile]
indent_style = tab
```

`package.json`:

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

### Tailwind CSS rules

When Tailwind is enabled — auto-detected via `tailwindcss` (v4+) being installed, or forced with `tailwind: true` — the config enables [`eslint-plugin-tailwindcss`](https://github.com/francoismassart/eslint-plugin-tailwindcss) recommended rules. The plugin **must** be able to resolve the Tailwind entry CSS — it hard-crashes lint (ENOENT) otherwise — so the entry is auto-detected: the workspace is scanned for `*.css` files containing `@import "tailwindcss"` (up to five directory levels below the workspace root — covers `packages/<x>/src/styles` — skipping dot dirs, `node_modules`, build outputs like `dist`/`.next`, and everything in `.gitignore`).

- Exactly **one** entry found → rules enable automatically with it (added as a standalone config block, easy to override).
- **Zero or several** entries:
    - auto-detected → nothing is added (inert); pass the entry explicitly (below)
    - forced (`tailwind: true`) → **hard error** — you explicitly asked for Tailwind linting, so a silent skip would be a lie
- An explicit entry always wins over the scan:

```js
export default defineLintConfig({
    tailwind: {
        cssConfigPath: './src/styles/tailwind.css', // relative to the package root
    },
});
```

### Type-aware rules (optional, disabled by default for performance)

Off by default (typed linting is slow); enable with `typeAware: true` or an options object.

Config files living outside any tsconfig `include` (`vite.config.ts`, `.storybook/main.ts`, …) need typescript-eslint's `allowDefaultProject` — it has **no default** here, and upstream forbids `**` in its patterns, so either spell out each directory level or generate the exact file list with the exported `scanWorkspace` (workspace-root-anchored, `.gitignore`- and build-output-aware; its absolute paths are relativized against `tsconfigRootDir` automatically):

```js
import { defineLintConfig, scanWorkspace } from '@kirill.konshin/lint';

export default defineLintConfig({
    typeAware: {
        allowDefaultProject: scanWorkspace('{vite,vitest}.config.ts'),
        maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 50, // defaults to allowDefaultProject.length when the list is given (typescript-eslint's own default is 8) - set it explicitly only when supplying multi-match globs
        tsconfigRootDir: '...', // defaults to the detected workspace root
    },
});
```

### IDEA settings

- Eslint: `**/*.{js,jsx,ts,tsx,cjs,cts,mjs,mts,md,mdx,htm,html,vue}`
- Prettier: `{**/*,*}.{js,jsx,ts,tsx,cjs,cts,mjs,mts,md,mdx,htm,html,vue,css,scss,sass,less,yml,yaml,json,json5,graphql,graphqls,xml}`

### Lint Staged

`.lintstagedrc.mjs`

```js
import { listStaged } from '@kirill.konshin/lint';
export default listStaged;
```

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
source ~/.zshrc # for VSCode terminal
yarn lint:staged
```

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

- Symlinks every `rules/*.md` into `.claude/rules/`, where Claude Code auto-discovers them.
- Symlinks every skill into `.claude/skills/<name>/` and `.codex/skills/<name>/` (`SKILL.md` plus this `README.md` alongside it, so a skill can reference `@README.md`) — e.g. `lint-repo`, which sets up the tooling above and audits the repo against the rules.
- Generates `AGENTS.md` referencing the same rules for other assistants (Codex, Cursor, Copilot, …) and symlinks `CLAUDE.md` to it.

### Safety checks

`init`/`update` refuse to run if `.claude/rules`, a skill target dir, or `CLAUDE.md` contains anything that isn't a symlink — this avoids silently overwriting files you created by hand. If `AGENTS.md` exists and wasn't generated by this tool, `init` skips it; use `update` to force regeneration.

### Rule file format

```yaml
---
type: always_apply # or agent_requested
description: Set of rules for projects which use Xxx # Required for agent_requested
paths:
    - '**/*.xxx'
---
```

## Migration

### 0.2.x → 0.3.x

The default-exported config array was replaced by the `defineLintConfig()` factory (see [Settings](#settings)) — every tool integration is auto-detected and controlled via options instead of hand-written blocks.

Before (0.2.x):

```js
import { defineConfig } from 'eslint/config';
import customConfig, { nextPlugin, includeIgnoreFile, tsExts } from '@kirill.konshin/lint';

export default defineConfig([
    ...customConfig,
    {
        files: [`**/*.${tsExts}`],
        plugins: { next: nextPlugin },
        settings: { next: { rootDir: 'path/to/next-app' } },
    },
    { name: 'Custom rules', rules: {} },
    includeIgnoreFile(import.meta.url, '.gitignore'),
    includeIgnoreFile(import.meta.url, '.prettierignore'),
]);
```

After (0.3.x):

```js
import { defineLintConfig } from '@kirill.konshin/lint';

export default [
    ...(await defineLintConfig({
        defaultIgnore: { importMetaUrl: import.meta.url },
        next: { rootDir: 'path/to/next-app' },
    })),
    { name: 'Custom rules', rules: {} },
];
```

- **Default export removed** — import `defineLintConfig` and call it. ESLint awaits the returned Promise, so a plain `export default defineLintConfig({...})` works when no extra blocks are needed
- **Manual `settings.next.rootDir` block** → `next: { rootDir }` option — or nothing at all: it is auto-detected from `next.config.*` locations (several apps → array)
- **Scans are workspace-root-anchored** — the Tailwind entry / `next.config.*` scans and `nx.json` detection resolve the workspace root via the package manager instead of trusting cwd, so linting from inside a package behaves like linting from the root
- **Manual Tailwind block** (`settings.tailwindcss.cssConfigPath`) → `tailwind: { cssConfigPath }` option; `tailwind: true` without a resolvable entry CSS is now a **hard error** instead of a silent skip
- **`includeIgnoreFile(import.meta.url, '.gitignore' / '.prettierignore')` pair** → `defaultIgnore: { importMetaUrl: import.meta.url }` (`includeIgnoreFile` stays exported for extra ignore files)
- **`tailwindEntry` const removed** → call the exported `findTailwindEntry(ignores)` when needed
- **New:** every block is a composable exported `*Config()` function; gated ones accept `true` / `false` / an options object with optional `enabled` (defaults to `true` in the object form); `typeAware: true` enables the (slow) type-aware rules
- **`prettier` is now a declared (required) peer dependency** — it was always required by the setup, so no action needed in practice
- **TypeScript consumers get real types** — `index.d.ts` ships with the package (`LintOptions` and friends)

Everything else — `prettier`, `listStaged`, extension lists (`tsExts`, …), `has*` detection exports, plugin re-exports (`nxPlugin`, …) — is unchanged.

## Why raw JS (no build)

Deliberately plain ESM, **no TypeScript build**: the config is loaded by `eslint.config.mjs` and pre-commit `lint:staged` before anything is built, so a `dist/` `main` would force a build before the repo could lint — not worth it for a config package.

## Issues

- Package managers
    - [ ] TODO verify the package end-to-end (workspace-root detection, Tailwind / `next.config.*` scans, `has*` capability probes, plugin resolution, `defineLintConfig` under a real lint run) with each manager:
        - [x] Yarn Berry, node-modules linker — this repo, fully covered
        - [ ] Yarn Berry **PnP** — entirely unverified: no `node_modules`, resolution/hoisting differs, `import.meta.resolve` probes and leaf-package detection may behave differently
        - [ ] Yarn 1 (classic) — workspace-root detection verified in a scratch workspace (no root env, `npm prefix`/lockfile-walk path); full config unverified
        - [ ] pnpm — workspace-root detection verified in a scratch workspace (`pnpm root -w`, no usable env); full config unverified
        - [ ] npm — root probes verified (`npm_config_local_prefix`, workspace-aware `npm prefix`); full config unverified
- ESLint 9
    - [x] https://github.com/microsoft/rushstack/issues/4635 Failed to patch ESLint because the calling module was not recognized
    - [x] https://github.com/microsoft/rushstack/issues/4965 Failed to patch ESLint because the calling module was not recognized
- ESLint 10
    - [ ] https://github.com/vercel/next.js/issues/89764 TypeError: Error while loading rule 'react/display-name': contextOrFilename.getFilename is not a function
    - [x] `import/no-default-export` (`eslint-plugin-import@2.32.0`) crashes every lint run under ESLint 10's flat config - its `sourceType()` helper reads `context.parserOptions`, which is `undefined` (not `{}`) there. Worked around by registering `eslint-plugin-import-x` (a drop-in replacement) under its own `import-x` key - see the `eslint-plugin-import-x` block in `index.js` - since ESLint 10 hard-errors ("Cannot redefine plugin") if you try to reuse the `import` key `eslint-config-next` already registers. The enforced rule is therefore `import-x/no-default-export`, not `import/*`.

## License

MIT
