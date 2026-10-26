import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ParserOptions as TsParserOptions } from '@typescript-eslint/parser';
import type { PluginSettings as TailwindPluginSettings } from 'eslint-plugin-tailwindcss';
import type { UserConfig as VitePlusUserConfig } from 'vite-plus';

import { findWorkspaceRoot } from './lib.js';

// for file lists and globs in lint.config.ts (`eslint.typeAware.allowDefaultProject`, `vitePlus.lint.overrides`)
export { tsExts } from './exts.js';
export { scanWorkspace } from './lib.js';

/*
 * The project config, the `@kirill.konshin/lint/config` entry: one `lint.config.ts` in the workspace root that every
 * entry point reads - the ESLint config, the Vite+ config and `lint-prepare`. A project that installs this package has
 * one, written by hand. This module loads no ESLint plugin, so
 * `lint.config.ts` imports `defineLintConfig` from here, never from the package root.
 */

type ProjectServiceOptions = Exclude<NonNullable<TsParserOptions['projectService']>, boolean>;

export type ToggleOptions = {
    enabled?: boolean;
};

export type DetectionOptions = ToggleOptions & {
    strict?: boolean;
};

export type NextOptions = ToggleOptions & {
    rootDir?: string | string[];
};

export type TailwindOptions = ToggleOptions & {
    cssConfigPath?: TailwindPluginSettings['cssConfigPath'];
    scoped?: boolean;
};

export type TypeAwareOptions = ToggleOptions &
    Pick<
        ProjectServiceOptions,
        'allowDefaultProject' | 'maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING'
    > & {
        tsconfigRootDir?: TsParserOptions['tsconfigRootDir'];
    };

export type DefaultIgnoreOptions =
    | { enabled: false; importMetaUrl?: string }
    | { enabled?: true; importMetaUrl: string };

/** Settings of the ESLint config only. */
export type EslintOptions = {
    /** Off by default: type-aware ESLint rules are slow. */
    typeAware?: boolean | TypeAwareOptions;
    defaultIgnore?: boolean | DefaultIgnoreOptions;
};

/**
 * Settings of the Vite+ config only, plus the project's own Vite+ blocks (`lint`, `fmt`, `staged`, `test`, `pack`, ...),
 * which `vitePlusConfig()` merges over its defaults: lists add up, maps merge by key, `staged` replaces the default.
 */
export type VitePlusOptions = VitePlusUserConfig & {
    /** On by default: `vp check` is the type check (tsgolint). */
    typeAware?: boolean | ToggleOptions;
};

/**
 * One skill source. `skills` names skills of the source: `true` installs one, `false` leaves one out. With no `true`
 * entry, every skill of the source is installed except the `false` ones.
 */
export type SkillSourceOptions = ToggleOptions & {
    /** Git ref of a remote source. */
    ref?: string;
    skills?: Record<string, boolean>;
};

/**
 * Skill sources, keyed by source: a git source (`owner/repo`) is installed with `skills add`; an npm package
 * (`@scope/name` or a name without `/`) is a dependency that ships skills, synced with `skills experimental_sync`.
 * `false` is `{ enabled: false }`.
 */
export type SkillsConfig = Record<string, boolean | SkillSourceOptions>;

export type LintConfig = {
    detection?: boolean | DetectionOptions;
    next?: boolean | NextOptions;
    storybook?: boolean | ToggleOptions;
    turbo?: boolean | ToggleOptions;
    nx?: boolean | ToggleOptions;
    jest?: boolean | ToggleOptions;
    vitest?: boolean | ToggleOptions;
    tailwind?: boolean | TailwindOptions;
    eslint?: EslintOptions;
    vitePlus?: VitePlusOptions;
    /** Skills `lint-prepare` installs, merged over {@link DEFAULT_LINT_CONFIG}. */
    skills?: SkillsConfig;
    /** Package rules by name (file name without `.md`): `false` leaves a rule out. */
    rules?: Record<string, boolean>;
};

export const LINT_CONFIG_FILE = 'lint.config.ts';

/** `{ name: true }` for each name. */
const only = (...names: string[]): Record<string, boolean> => Object.fromEntries(names.map((name) => [name, true]));

/**
 * The base every resolved config starts from. Every project gets every skill below; `lint.config.ts` turns off what it
 * does not need (`'expo/skills': false`).
 *
 * Remote sources follow the Core Pack https://skills.sh/p/DxVN7q53wGdAcZQt (synced by hand, see the repository's
 * `curated-skills-update` skill), plus the official skills of the libraries the rules cover. Each source lists its
 * skills: the repositories also hold their maintainers' internal skills. `ref` pins a full commit SHA.
 */
export const DEFAULT_LINT_CONFIG: LintConfig = {
    skills: {
        // this package's own skills
        '@kirill.konshin/lint': true,

        // Core Pack
        'vercel-labs/agent-skills': {
            ref: '063bee94c3f4df8453406c830b0a7df0f2860278',
            skills: only(
                'vercel-react-best-practices',
                'vercel-composition-patterns',
                'vercel-react-native-skills',
                'vercel-react-view-transitions',
                'web-design-guidelines',
            ),
        },
        'vercel/ai': { ref: '682e2dd71456f14f9da33a1b983d1998c3a1184c', skills: only('ai-sdk') },
        // Hero UI is the default UI kit for Tailwind sites (rules/tailwind.md); shadcn for projects that already use it
        'shadcn-ui/ui': { ref: '481d523374745e77d0cf9c53a4115ab5dd7c8481', skills: only('shadcn') },
        'heroui-inc/heroui': {
            ref: '31a6261590798d3c46f9cd0adf507653b3bc29ad',
            skills: only('heroui-react', 'heroui-native'),
        },
        // not `material-ui-tailwind`: MUI and Tailwind are never mixed (rules/mui.md)
        'mui/material-ui': {
            ref: 'f63c84ad6f3f8bd1d6f822bc6ed4ec738ec124b7',
            skills: only('material-ui-nextjs', 'material-ui-styling', 'material-ui-theming'),
        },
        'neondatabase/agent-skills': {
            ref: 'ccca3334a7542d3133134cc6926f2fafc6edeb1f',
            skills: only('neon', 'neon-postgres', 'neon-postgres-branches', 'neon-auth'),
        },

        // official skills of the libraries the rules cover
        'vercel/next.js': {
            ref: 'cbf49db30a655ac17c92c2951885c4256db14b9e',
            skills: only(
                'next-bundle-optimizer',
                'next-cache-components-adoption',
                'next-cache-components-optimizer',
                'next-dev-loop',
                'next-partial-prefetching-adoption',
                'next-partial-prefetching-optimizer',
            ),
        },
        // shipped in `@reduxjs/toolkit` too, but nested deeper than `skills experimental_sync` looks
        'reduxjs/redux-toolkit': {
            ref: '0fd611cc79d44990ac9a040dec4d5cb446233440',
            skills: only(
                'build-modern-redux-apps/modern-redux',
                'build-modern-redux-apps/redux-dataflow',
                'evolve-and-diagnose-redux-apps/debug-redux-toolkit-apps',
                'evolve-and-diagnose-redux-apps/migrate-to-modern-redux',
                'manage-server-data/adopt-rtk-query',
                'manage-server-data/generate-rtk-query-from-openapi',
                'model-redux-state/build-slices-and-selectors',
                'model-redux-state/design-state-ownership',
                'orchestrate-side-effects/handle-side-effects',
            ),
        },
        'vercel/turborepo': { ref: '8003ff0fe919160f68367cd08465b179410e0692', skills: only('turborepo') },
        'nrwl/nx-ai-agents-config': {
            ref: '525ce266e22ec54e006d630d3b560658e8c3001c',
            skills: only(
                'link-workspace-packages',
                'monitor-ci',
                'nx-cloud-api',
                'nx-cloud-cache-investigator',
                'nx-cloud-ci-failure-review',
                'nx-generate',
                'nx-import',
                'nx-plugins',
                'nx-run-tasks',
                'nx-workspace',
            ),
        },
        'expo/skills': {
            ref: 'd5caf7fdf8b4854351f05841a7e315ac87ad7d24',
            skills: only(
                'eas-app-stores',
                'eas-hosting',
                'eas-observe',
                'eas-simulator',
                'eas-update',
                'eas-update-insights',
                'eas-workflows',
                'expo-animation',
                'expo-app-clip',
                'expo-brownfield',
                'expo-data-fetching',
                'expo-design-system',
                'expo-dev-client',
                'expo-dom',
                'expo-examples',
                'expo-migrate-module',
                'expo-module',
                'expo-native-ui',
                'expo-overview',
                'expo-project-structure',
                'expo-router',
                'expo-ui',
                'expo-upgrade',
                'expo-web-to-native',
            ),
        },
        // shipped in `@playwright/cli` too, found by `skills experimental_sync` only when it is a direct dependency
        'microsoft/playwright-cli': { ref: 'b1a5903c5b633b8c9f843ad7b629c2a78437040c', skills: only('playwright-cli') },
    },
};

/** Type-checks `lint.config.ts`; returns the config as it is. */
export function defineLintConfig(config: LintConfig): LintConfig {
    return config;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Deep merge, `override` wins. Objects merge key by key, arrays and other values are replaced. A boolean over an
 * options object keeps the options and sets `enabled` (`false` over `{ ref }` is `{ ref, enabled: false }`); an options
 * object over a boolean replaces it (options imply `enabled: true`).
 */
export function mergeLintConfig<T>(base: T, override: unknown): T {
    if (override === undefined) return base;
    if (typeof override === 'boolean' && isPlainObject(base)) return { ...base, enabled: override } as T;
    if (!isPlainObject(base) || !isPlainObject(override)) return override as T;

    const merged: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(override)) merged[key] = mergeLintConfig(merged[key], value);
    return merged as T;
}

const loaded = new Map<string, Promise<LintConfig>>();

/**
 * The `lint.config.ts` of the workspace root, `{}` when there is none. Only the root is read: a monorepo has one config,
 * packages differ through the arguments of the entry points. Node loads the file natively (type stripping), so it must
 * use only erasable TypeScript syntax. Cached per root.
 */
export function loadLintConfig(root: string = findWorkspaceRoot()): Promise<LintConfig> {
    const cached = loaded.get(root);
    if (cached) return cached;

    const config = importLintConfig(join(root, LINT_CONFIG_FILE));
    loaded.set(root, config);
    return config;
}

async function importLintConfig(file: string): Promise<LintConfig> {
    if (!existsSync(file)) return {};
    const imported = (await import(pathToFileURL(file).href)) as { default?: LintConfig };
    return imported.default ?? {};
}

/** {@link DEFAULT_LINT_CONFIG}, then the root `lint.config.ts`, then `overrides`, merged deep. */
export async function resolveLintConfig(
    overrides: LintConfig = {},
    root: string = findWorkspaceRoot(),
): Promise<LintConfig> {
    return mergeLintConfig(mergeLintConfig(DEFAULT_LINT_CONFIG, await loadLintConfig(root)), overrides);
}
