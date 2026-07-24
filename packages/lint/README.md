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

## ESLint

`eslint.config.mjs`:

Every tool integration — Next.js, Nx, Turborepo, Storybook, Jest, Vitest, Tailwind — is auto-detected (the detection results are exported as `has*` booleans for debugging). Pass options (JSDoc-typed, see `LintOptions` in `index.js`) to force any of them on/off or to supply tool-specific settings:

```js
import { defineLintConfig } from '@kirill.konshin/lint';

// every tool integration auto-detected
export default defineLintConfig({
    defaultIgnore: { importMetaUrl: import.meta.url }, // .gitignore + .prettierignore as ESLint ignores
});
```

Config can be extended, `defineLintConfig` returns a `Promise` (natively awaited by ESLint), to compose with your own blocks, `await` it:

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

### Full Config Example

Default behavior in the comments, all tools are optional (see [Detection](#detection)). Enable/disable tools using:

- `undefined` (default) — auto-detect, see [Detection](#detection)
- `true` — force ON (use when detection misses a tool, can be useful to see the error why tool is missing)
- `false` — force OFF
- `{ /* tool options *./ }` — object configuration implies `enabled: true` even if omitted; set `enabled: false` to force OFF while keeping the other options in place, see example

```js
import { defineLintConfig, scanWorkspace } from '@kirill.konshin/lint';

// function form shown
export default defineLintConfig(() => ({
    // enabled (default true) = tools are ON unless said otherwise;
    // strict (default false) = same-scope package probes only, no workspace evidence scans
    // `{ enabled: false, strict: true }` is ideal for per-package configs
    detection: { enabled: true, strict: false }, // default

    // ON by default; app roots auto-detected (next.config.*, package.json depending on next, src/{app,pages}/);
    // can be force OFF; several apps auto-detect as array; pass the package root, not src
    next: { rootDir: 'apps/web' }, // string or array

    storybook: true, // force ON if detection failed
    turbo: false, // force OFF
    nx: true,
    jest: false,
    vitest: { enabled: true }, // object form implies ON; { enabled: false, ... } turns OFF keeping options

    // ON by default; auto-detected single entry CSS; explicit path always wins over the scan
    tailwind: { cssConfigPath: 'apps/web/src/app/index.css' },

    // OFF by default
    defaultIgnore: {
        importMetaUrl: import.meta.url, // required, error if turned on via `defaultIgnore: true`
    },

    // OFF by default (slow) - see "Type-aware rules"
    typeAware: {
        allowDefaultProject: scanWorkspace('{vite,vitest}.config.ts'), // no default; absolute paths are relativized; ** globs are not supported
        maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 50, // defaults to the list length, (default 8), set it explicitly only when supplying multi-match globs
        tsconfigRootDir: process.cwd(), // defaults to the detected workspace root
    },
}));
```

### Per-package configs (monorepo)

ESLint 10 resolves the config **per linted file**: the nearest `eslint.config.mjs` up the tree wins **entirely** (no cascading/inheritance of rules). For full per-app Next/Tailwind linting in a multi-app monorepo, give each app its own config — either inherit the root and add overrides:

```js
// apps/web/eslint.config.mjs
import rootConfig from '../../eslint.config.mjs';

export default [...(await rootConfig), { rules: { 'tailwindcss/no-custom-classname': 'off' } }];
```

…or simply call `defineLintConfig` again with the options this app needs:

```js
// apps/web/eslint.config.mjs
import { fileURLToPath } from 'node:url';
import { defineLintConfig } from '@kirill.konshin/lint';

export default defineLintConfig({
    detection: { enabled: false, strict: true }, // fully explicit: this config only sees its own scope
    // do not use workspace-wide auto-scan, provide exactly ONE from THIS leaf package
    tailwind: { cssConfigPath: fileURLToPath(new URL('src/app/index.css', import.meta.url)) },
});
```

⚠️ Nearest-wins means root-only blocks (e.g. `defaultIgnore`, custom rules) do NOT apply to the subtree unless inherited or re-declared.

[Detection](#detection) runs against the **workspace root** even from a nested config, so per-app tool settings (`cssConfigPath`) should be explicit absolute paths — relative ones depend on the lint cwd.

The Tailwind block auto-scopes to the **workspace package** owning the entry CSS (emitted as the block's `basePath`), so a single root config doesn't flag class-like strings in non-Tailwind packages; pass `tailwind: { scoped: false }` to apply it workspace-wide (no-op when the entry is owned by the workspace root itself).

## Prettier `.prettierrc.mjs`:

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

## Editor Config `.editorconfig`

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
- **Manual `settings.next.rootDir` block** → `next: { rootDir }` option — or nothing at all: it is auto-detected from `next.config.*` locations, `package.json`s depending on `next`, and `src/app`/`src/pages` trees (several apps → array)
- **Scans are workspace-root-anchored** — the Tailwind entry / `next.config.*` scans and `nx.json` detection resolve the workspace root via the package manager instead of trusting cwd, so linting from inside a package behaves like linting from the root
- **Manual Tailwind block** (`settings.tailwindcss.cssConfigPath`) → `tailwind: { cssConfigPath }` option; `tailwind: true` without a resolvable entry CSS is now a **hard error** instead of a silent skip, and several entry CSS candidates are a hard error even in auto mode
- **`includeIgnoreFile(import.meta.url, '.gitignore' / '.prettierignore')` pair** → `defaultIgnore: { importMetaUrl: import.meta.url }` (`includeIgnoreFile` stays exported for extra ignore files)
- **`tailwindEntry` const removed** → call the exported `findTailwindEntry(ignores)` when needed
- **New:** every block is a composable exported `*Config()` function; gated ones accept `true` / `false` / an options object with optional `enabled` (defaults to `true` in the object form); `typeAware: true` enables the (slow) type-aware rules
- **`prettier` is now a declared (required) peer dependency** — it was always required by the setup, so no action needed in practice
- **TypeScript consumers get real types** — `index.d.ts` ships with the package (`LintOptions` and friends)
- **Hoisting** if tools can't find packages, fix it once in the package manager config: keep default hoisting (drop `installConfig.hoistingLimits`/`nohoist`), on pnpm add `public-hoist-pattern[]=<pkg>` to `.npmrc`, or add the tool to root `devDependencies`. Run eslint with `LINT_DEBUG=1` to trace detection.
- **Scans follow the declared workspace.** `scanWorkspace` (also used by all evidence scans) now covers the root directory plus the real `workspaces`/`pnpm-workspace.yaml` packages via `@manypkg/get-packages` instead of a blind ≤5-level glob — config files in directories that are not declared workspace members are only found via the root scan, and the depth limit is gone.
- `has*` probes are anchored at the **workspace root** (via `local-pkg`) instead of this package's install location — identical for standard root installs.

Everything else — `prettier`, `listStaged`, extension lists (`tsExts`, …), `has*` detection exports, plugin re-exports (`nxPlugin`, …) — is unchanged.

## Development

### Why raw JS (no build)

Deliberately plain ESM, **no TypeScript build**: the config is loaded by `eslint.config.mjs` and pre-commit `lint:staged` before anything is built, so a `dist/` `main` would force a build before the repo could lint — not worth it for a config package.

### Eslint

The package ships hand-written types (`index.d.ts`) that pull real types from the underlying packages — `Linter.Config` from `eslint`, `PluginSettings` from `eslint-plugin-tailwindcss`, `prettier`'s `Config`, `lint-staged`'s `Configuration` — so `defineLintConfig` options and all exports are fully typed in `eslint.config.mjs` (via editor inference) and `eslint.config.ts`.

**Every** block lives in a themed `configs/*.js` file and is exported as a standalone function for manual composition (and easy testing/mocking), in the order `defineLintConfig` applies them: `baseConfig` (JS recommended + global ignores + globals + core-rule overrides), `defaultIgnoreConfig`, `reactConfig` (the whole React family, see below), `prettierConfig`, `storybookConfig`, `typeAwareConfig` (off by default; ordered before the import blocks so its naming-convention rule loses to the default-export relaxation), `importXConfig` (includes the default-export relaxation for conventional files), `importSortConfig`, `unusedImportsConfig`, `promiseConfig`, `unicornConfig`, `turboConfig`, `tailwindConfig`, `nxConfig`, `jestConfig`, `vitestConfig`, `testConfig`.

Tool-gated functions take the same value as their `defineLintConfig` flag and gate themselves (`tailwindConfig(true)`, `nxConfig(false)` → `[]`, `tailwindConfig({ cssConfigPath })`). `reactConfig(nextFlag, strict)` is the whole family in its load-bearing order — Next is just a shortcut to an opinionated React/TypeScript setup, so the TS wiring, overrides and settings apply no matter whether Next or plain React won: `nextConfig` (chooser: `nextBaseConfig` when Next is enabled, `reactBaseConfig` fallback otherwise) → `typescriptOverridesConfig` → `nextOverridesConfig` → `reactSettingsConfig` — all exported individually too.

### Detection

Due to limitations package visibility between leaf and root this package has to be creative to support config-free detection.

1. **Package probe** — `local-pkg`'s `isPackageExists` anchored at the **workspace root**, the same scope the plugins resolve from at lint time (`has<Pkg>` exported for debugging).
2. **Evidence scan** — tool config files across the workspace: the root directory plus every **workspace package** (the real `workspaces`/`pnpm-workspace.yaml` globs via `@manypkg/get-packages`, not a depth heuristic), skipping dot dirs, build outputs, and `.gitignore`d files; exported as `scanWorkspace`. Catches tools installed only in **leaf** packages, invisible to the probe (1). The workspace root itself comes from env (`PROJECT_CWD`/`npm_config_local_prefix`) with `@manypkg/find-root` as the fallback (workspace manifest walk, nearest `package.json` for single-package repos; exported as `findWorkspaceRoot`), so linting from inside a package still sees the whole repo.
3. **Hoisting, not bridging** — the plugins need the tool's package resolvable from the workspace root; a tool that is evidently in use (2) but not resolvable there (1) is a **hard error** with hoisting guidance (keep default hoisting, pnpm `public-hoist-pattern`, or a root devDependency — see the error text) instead of a silent skip or a cryptic plugin crash. Fix it once in the package manager config; nothing is symlinked at lint time.
4. **Yarn Berry PnP** — there is no hoisting to configure; declare the tools at the workspace root as well, keeping versions in sync with the leaves (e.g. the `"vitest": "$vitest"` version-alias hack); `next` documents its own monorepo ESLint setup.

| Option      | Package          | Evidence glob                                                               | When zero / many found                                                                              |
| ----------- | ---------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `tailwind`  | `tailwindcss`¹   | `*.css` with `@import "tailwindcss"`                                        | needs exactly **one**: zero → off (forced → error), several → **always** error; set `cssConfigPath` |
| `next`      | `next`¹          | `next.config.*`, `package.json` depending on `next`, `src/{app,pages}/` dir | zero → no `rootDir` (optional); many → all as array; or set `rootDir` (the package root, not `src`) |
| `storybook` | `storybook`¹     | `.storybook/main.*`                                                         | presence is enough                                                                                  |
| `jest`      | `jest`¹          | `jest.config.*`                                                             | presence is enough                                                                                  |
| `vitest`    | `vitest`¹        | `{vitest,vite}.config.*`                                                    | presence is enough                                                                                  |
| `nx`        | (plugin bundled) | `nx.json` at the workspace root                                             | —                                                                                                   |
| `turbo`     | `turbo`          | package probe only                                                          | —                                                                                                   |

¹ the plugins need the tool's package resolvable at lint time (`tailwindcss` for the theme-loading workers, `next` for `eslint-config-next`'s internal `require`s, `storybook` for its plugin's static import, `jest` for version sniffing) — resolvable from the workspace root, or the hard error of step 3 fires.

The machinery is controlled by the `detection` option (same toggle notation as the tools):

- `detection: false` — tools are OFF unless explicitly enabled; enabled tools still auto-detect their settings (step 2)
- `detection: { strict: true }` — only step 1 runs: the `has*` package probes **are** the strict detection — no workspace evidence scans (2). Mandatory settings (`cssConfigPath`) must then be explicit, and `nx.json` is checked at **cwd** instead of the workspace root (`hasNx` is the only non-package `has*`)
- `detection: { enabled: false, strict: true }` — fully explicit: tools on only when set, probes only

Set `LINT_DEBUG=1` to trace the machinery: `has*` probe results, every workspace scan (glob, root, files found) and each tool's gate verdict (supplied options, absolutized & scanned evidence files, effective enabled status + reason).

> `basePath: 'packages/xxx'` (ESLint ≥ 9.30) can scope a config object to a directory within a single root config, but it won't help with detection — `defineLintConfig` detects once, workspace-wide (e.g. Tailwind still demands exactly one entry CSS), so per-app settings would still have to be spelled out block by block; nested configs are the cleaner tool for this.

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
    - [ ] TODO verify the package end-to-end (workspace-root detection, Tailwind / `next.config.*` scans, `has*` capability probes, plugin resolution, `defineLintConfig` under a real lint run) with each manager:
        - [x] Yarn Berry, node-modules linker — this repo, fully covered
        - [ ] Yarn Berry **PnP** — root-declared `tailwindcss` verified working (see "Detection" step 4); full config run (plugin loading, capability probes) unverified since the switch to `@manypkg/find-root`/`local-pkg`
        - [ ] Yarn 1 (classic) — root detection now delegates to `@manypkg/find-root` (workspace-manifest walk); unverified since the switch
        - [ ] pnpm — root detection via `@manypkg/find-root` (`pnpm-workspace.yaml`); `public-hoist-pattern` guidance unverified in a real pnpm workspace
        - [ ] npm — env fast-path (`npm_config_local_prefix`) verified previously; `@manypkg/find-root` fallback unverified since the switch
- ESLint 9
    - [x] https://github.com/microsoft/rushstack/issues/4635 Failed to patch ESLint because the calling module was not recognized
    - [x] https://github.com/microsoft/rushstack/issues/4965 Failed to patch ESLint because the calling module was not recognized
- ESLint 10
    - [ ] https://github.com/vercel/next.js/issues/89764 TypeError: Error while loading rule 'react/display-name': contextOrFilename.getFilename is not a function
    - [x] `import/no-default-export` (`eslint-plugin-import@2.32.0`) crashes every lint run under ESLint 10's flat config - its `sourceType()` helper reads `context.parserOptions`, which is `undefined` (not `{}`) there. Worked around by registering `eslint-plugin-import-x` (a drop-in replacement) under its own `import-x` key - see the `eslint-plugin-import-x` block in `index.js` - since ESLint 10 hard-errors ("Cannot redefine plugin") if you try to reuse the `import` key `eslint-config-next` already registers. The enforced rule is therefore `import-x/no-default-export`, not `import/*`.

## License

MIT
