/*
 * Hand-written declarations for the raw-JS package (see README "Why raw JS" - there is no build to
 * emit them from). Keep in sync with index.js / configs/*.js and their JSDoc.
 *
 * Types are pulled from the real underlying packages wherever they export them (eslint's
 * `Linter.Config`, eslint-plugin-tailwindcss's `PluginSettings`, prettier's `Config`,
 * lint-staged's `Configuration`, the plugins' own default-export types), so the options here stay
 * in sync with how the tools themselves define their configs. `@next/eslint-plugin-next` exports
 * no settings type - `NextOptions.rootDir` mirrors its documented `settings.next.rootDir` schema.
 */
import type { ParserOptions as TsParserOptions } from '@typescript-eslint/parser';
import type { Linter } from 'eslint';
import type { PluginSettings as TailwindPluginSettings } from 'eslint-plugin-tailwindcss';
import type { Configuration as LintStagedConfiguration } from 'lint-staged';
import type { Config as PrettierConfig } from 'prettier';

type ProjectServiceOptions = Exclude<NonNullable<TsParserOptions['projectService']>, boolean>;

/**
 * Base shape of every tool's options object. Using the object form implies the tool is ON -
 * `enabled` defaults to `true`, so a partially configured tool doesn't also need a separate
 * `true` anywhere; set `enabled: false` to force it off while keeping the other options in place.
 */
export type ToggleOptions = {
    enabled?: boolean;
};

/**
 * Detection behavior ({@link defineLintConfig} `detection`) - the same toggle notation as the
 * tool flags:
 * - `undefined` / `true` / `{}` - tools default ON via full auto-detection
 * - `false` / `{ enabled: false }` - tools default OFF; explicitly enabled tools still
 *   auto-detect their settings
 * - `strict: true` - same-scope package probes only (exactly what the `has*` checks are): no
 *   workspace walks, no evidence scans, no symlink bridges; mandatory settings like
 *   `cssConfigPath` must be explicit, and `nx.json` is checked at cwd instead of the workspace
 *   root. `{ enabled: false, strict: true }` is ideal for per-package monorepo configs.
 */
export type DetectionOptions = ToggleOptions & {
    /** same-scope package probes only - no workspace walks/scans/bridges */
    strict?: boolean;
};

/** Options for the Next.js blocks ({@link nextBaseConfig}). */
export type NextOptions = ToggleOptions & {
    /**
     * Root of the Next.js app(s) for `@next/eslint-plugin-next` (`settings.next.rootDir`) - needed
     * when the apps don't live at the workspace root, e.g. `path/to/next-app` (globs are supported
     * by the plugin; pass the package root, not `src` - the plugin resolves both the `pages`/`app`
     * and `src/pages`/`src/app` layouts from it). When omitted, auto-detected via
     * {@link findNextRoots}: no evidence found → no settings (the setting is optional), several
     * apps → all of them as an array.
     *
     * @see https://nextjs.org/docs/app/api-reference/config/eslint
     */
    rootDir?: string | string[];
};

/** Options for the Tailwind block ({@link tailwindConfig}). */
export type TailwindOptions = ToggleOptions & {
    /**
     * Tailwind v4 entry CSS for `eslint-plugin-tailwindcss` (`settings.tailwindcss.cssConfigPath`),
     * absolute or relative to the lint working directory. When omitted, auto-detected via
     * {@link findTailwindEntry}.
     */
    cssConfigPath?: TailwindPluginSettings['cssConfigPath'];
};

/**
 * Options for the type-aware block ({@link typeAwareConfig}). `allowDefaultProject` and
 * `maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING` are typescript-eslint's own
 * `projectService` options (real types). `allowDefaultProject` has NO default - generate the file
 * list with {@link scanWorkspace} (absolute entries are relativized against `tsconfigRootDir`
 * automatically); the match cap defaults to that list's length when it is given (set it explicitly
 * when using multi-match globs); `tsconfigRootDir` defaults to the detected workspace root.
 */
export type TypeAwareOptions = ToggleOptions &
    Pick<
        ProjectServiceOptions,
        'allowDefaultProject' | 'maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING'
    > & {
        /** Defaults to {@link findWorkspaceRoot}. */
        tsconfigRootDir?: TsParserOptions['tsconfigRootDir'];
    };

/** Options for the default-ignore block ({@link defaultIgnoreConfig}). */
export type DefaultIgnoreOptions = ToggleOptions & {
    /**
     * `import.meta.url` of the consumer's `eslint.config.mjs` - the `.gitignore` and
     * `.prettierignore` files are resolved next to it. Required: the config file location cannot
     * be auto-detected.
     */
    importMetaUrl: string;
};

/**
 * Per-tool toggles for {@link defineLintConfig}. Every flag is optional:
 * - `undefined` (default) - auto-detect via the corresponding `has*` export
 * - `true` or an options object - force the tool's blocks ON (use when detection misses a tool
 *   that lives only in leaf packages of a monorepo); in the object form `enabled` defaults to
 *   `true` and can be set to `false` to force OFF while keeping the other options in place
 * - `false` - force OFF
 *
 * The gated `*Config()` block functions accept the same flag value directly.
 */
export type LintOptions = {
    /** Detection behavior: default tool state + strict mode; see {@link DetectionOptions} */
    detection?: boolean | DetectionOptions;
    /** Next.js (`eslint-config-next`); when off, generic React/JSX rules apply instead */
    next?: boolean | NextOptions;
    /** Storybook (`eslint-plugin-storybook`) */
    storybook?: boolean | ToggleOptions;
    /** Turborepo (`eslint-plugin-turbo`) */
    turbo?: boolean | ToggleOptions;
    /** Nx (`@nx/eslint-plugin` base + `@nx/dependency-checks`) */
    nx?: boolean | ToggleOptions;
    /** Jest recommended rules for `*.{test,spec}.*` */
    jest?: boolean | ToggleOptions;
    /** Vitest recommended rules for `*.{test,spec}.*` */
    vitest?: boolean | ToggleOptions;
    /** Tailwind (`eslint-plugin-tailwindcss`); forcing ON without a resolvable entry CSS is a hard error, several entry CSS candidates always are */
    tailwind?: boolean | TailwindOptions;
    /** Type-aware TypeScript rules; off by default (slow), nothing to auto-detect */
    typeAware?: boolean | TypeAwareOptions;
    /** `.gitignore` + `.prettierignore` as ESLint ignores; off by default, `true` without `importMetaUrl` is a hard error */
    defaultIgnore?: boolean | DefaultIgnoreOptions;
};

/**
 * Build the shared flat ESLint config. By default every tool integration is auto-detected (see the
 * `has*` exports); pass {@link LintOptions} to force any of them on/off or to supply tool-specific
 * settings. ESLint natively awaits a Promise default export, so a plain
 * `export default defineLintConfig({...})` works; `await` it only when composing with extra blocks.
 */
export function defineLintConfig(
    options?: LintOptions | Promise<LintOptions> | (() => LintOptions | Promise<LintOptions>),
): Promise<Linter.Config[]>;

// ----- Blocks (in the order defineLintConfig applies them; from configs/*.js) -----
// Gated blocks take their LintOptions flag and return [] when resolved off.

/** Core JS recommended rules, global ignores, browser + Node globals, and core-rule overrides. */
export function baseConfig(): Linter.Config[];
/**
 * `.gitignore` + `.prettierignore` (next to the consumer's config file, both must exist) as
 * ESLint ignores. Off by default; enabling without `importMetaUrl` is a hard error.
 */
export function defaultIgnoreConfig(option?: boolean | DefaultIgnoreOptions): Linter.Config[];
/** The whole `eslint-config-next` flat config, plus `settings.next.rootDir` when given. Next-only, ungated. */
export function nextBaseConfig(options?: NextOptions): Promise<Linter.Config[]>;
/** React/React Hooks/jsx-a11y rules for non-Next (e.g. Vite) React projects. Ungated. */
export function reactBaseConfig(): Linter.Config[];
/** Chooser: {@link nextBaseConfig} when Next is enabled, the {@link reactBaseConfig} fallback otherwise. */
export function nextConfig(option?: boolean | NextOptions, strict?: boolean): Promise<Linter.Config[]>;
/**
 * The whole React family in its load-bearing order - {@link nextConfig} (Next is just a shortcut
 * to an opinionated React/TypeScript setup), then {@link typescriptOverridesConfig},
 * {@link nextOverridesConfig} and {@link reactSettingsConfig}, which apply no matter whether Next
 * or plain React won. Used by {@link defineLintConfig}; `option` is the `next` flag.
 */
export function reactConfig(option?: boolean | NextOptions, strict?: boolean): Promise<Linter.Config[]>;
/** `eslint-config-next/typescript` (typescript-eslint wiring, which stems from Next) + deliberate rule overrides. */
export function typescriptOverridesConfig(): Linter.Config[];
/** Overrides of rules set by `eslint-config-next` (always applied, harmless without Next). */
export function nextOverridesConfig(): Linter.Config[];
/** React version settings workaround (ESLint 10 + Next). Always applied. */
export function reactSettingsConfig(): Linter.Config[];
/** Prettier compatibility (`eslint-config-prettier/flat`). */
export function prettierConfig(): Linter.Config[];
/** Storybook recommended rules. */
export function storybookConfig(option?: boolean | ToggleOptions, strict?: boolean): Promise<Linter.Config[]>;
/** eslint-plugin-import-x recommended rules + overrides + the default-export relaxation for conventional files. */
export function importXConfig(): Linter.Config[];
/** Deterministic import ordering (eslint-plugin-simple-import-sort). */
export function importSortConfig(): Linter.Config[];
/** Autofixable removal of unused imports. */
export function unusedImportsConfig(): Linter.Config[];
/** eslint-plugin-promise recommended rules + overrides. */
export function promiseConfig(): Linter.Config[];
/** Filename casing + node: protocol (two hand-picked unicorn rules). */
export function unicornConfig(): Linter.Config[];
/** Type-aware rules via typescript-eslint's projectService; off unless the flag is set (nothing to auto-detect). */
export function typeAwareConfig(option?: boolean | TypeAwareOptions, strict?: boolean): Linter.Config[];
/** Turborepo rules. */
export function turboConfig(option?: boolean | ToggleOptions): Promise<Linter.Config[]>;
/**
 * Tailwind recommended rules. Explicit `cssConfigPath` wins; otherwise auto-found via
 * {@link findTailwindEntry}. Zero entries: inert when auto-detected, throws when forced on
 * (`true`/options). Several entries ALWAYS throw - pass `cssConfigPath` to pick one.
 */
export function tailwindConfig(option?: boolean | TailwindOptions, strict?: boolean): Promise<Linter.Config[]>;
/** Nx plugin registration + `@nx/dependency-checks`. */
export function nxConfig(option?: boolean | ToggleOptions, strict?: boolean): Promise<Linter.Config[]>;
/** Jest recommended rules, scoped to test files. */
export function jestConfig(option?: boolean | ToggleOptions, strict?: boolean): Linter.Config[];
/** Vitest recommended rules + globals, scoped to test files. */
export function vitestConfig(option?: boolean | ToggleOptions, strict?: boolean): Linter.Config[];
/** Runner-agnostic test rules (consistent-test-it, test colocation). Always applied. */
export function testConfig(): Linter.Config[];

// ----- Detection (module-load time capability probes, exported for debugging; from lib.js) -----

/**
 * Workspace root of the consumer project - the anchor for every config-file scan and for `nx.json`
 * detection. Resolved from the package manager (env: Yarn Berry `PROJECT_CWD` / npm
 * `npm_config_local_prefix`; CLIs: `pnpm root -w`, Yarn Berry via `yarn node`, `npm prefix`),
 * falling back to a lockfile walk bounded by `.git`; every candidate must contain `cwd`.
 * Cached per `cwd`.
 */
export function findWorkspaceRoot(cwd?: string): string;

export const hasNext: boolean;
export const hasStorybook: boolean;
export const hasVite: boolean;
export const hasJest: boolean;
export const hasVitest: boolean;
export const hasTurbo: boolean;
export const hasNx: boolean;
export const hasTailwind: boolean;

// ----- Extension lists (from lib.js) -----

export const tsExtsRaw: string;
export const eslintExtsRaw: string;
export const prettierExtsRaw: string;
export const tsExts: string;
export const eslintExts: string;
export const prettierExts: string;

// ----- Plugin re-exports (detection-gated at module load; null when the tool wasn't detected) -----

export const nextPlugin: typeof import('@next/eslint-plugin-next').default | null;
export const nxPlugin: typeof import('@nx/eslint-plugin').default | null;
export const turboPlugin: typeof import('eslint-plugin-turbo').default | null;
export const jestPlugin: typeof import('eslint-plugin-jest');
export const vitestPlugin: typeof import('@vitest/eslint-plugin').default;

// ----- Helpers & companion configs -----

/**
 * Auto-find the Tailwind v4 entry CSS: the single `*.css` (scanned up to 5 directory levels below
 * the workspace root, skipping `.gitignore`d files and build outputs) containing
 * `@import "tailwindcss"`; null when zero or several match.
 */
export function findTailwindEntry(ignores: string[]): string | null;

/**
 * Auto-find Next.js app roots below the workspace root (scanned up to 5 levels, skipping
 * `.gitignore`d files and build outputs). `next.config.*` is optional in Next.js, so any of three
 * signals marks an app root: a `next.config.*`, a `package.json` depending on `next`
 * (dependencies/devDependencies - peer declarations mark libraries, not apps), or a
 * `src/app`/`src/pages` directory (the reported root is the directory containing `src`);
 * deduplicated and sorted.
 */
export function findNextRoots(ignores: string[]): string[];

/**
 * Glob for config-file candidates below the workspace root (up to 5 directory levels, skipping
 * dot dirs unless `dot`, build outputs, extra `ignores` and everything in the root `.gitignore`).
 * Returns absolute paths - useful for building file lists like `typeAware.allowDefaultProject`.
 */
export function scanWorkspace(fileGlob: string, ignores?: string[], options?: { dot?: boolean }): string[];

/** Convert an ignore file (`.gitignore`, `.prettierignore`) into an ESLint ignores block. */
export function includeIgnoreFile(importMetaUrl: string, ignoreFile: string): Linter.Config;

/** Shared Prettier configuration (`.prettierrc.mjs`: `export default prettier`). */
export const prettier: PrettierConfig;

/** Shared lint-staged configuration (`.lintstagedrc.mjs`: `export default listStaged`). */
export const listStaged: LintStagedConfiguration;
