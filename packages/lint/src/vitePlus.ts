import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UserConfig } from 'vite-plus';
import type { OxfmtConfig } from 'vite-plus/fmt';
import type { OxlintConfig, OxlintOverride } from 'vite-plus/lint';

import { tailwindGate } from './configs/tailwind.js';
import { defaultExportFiles, filenameCaseIgnore } from './conventions.js';
import { eslintExts, markupExtsRaw, prettierExtsRaw, tsExts, tsExtsRaw } from './exts.js';
import type { DetectionOptions, TailwindOptions, ToggleOptions } from './index.js';
import {
    asOptions,
    findNextRoots,
    findWorkspaceRoot,
    GLOBAL_IGNORES,
    hasJest,
    hasNext,
    hasNx,
    hasStorybook,
    hasTurbo,
    scanWorkspace,
    toolGate,
} from './lib.js';

/*
 * Vite+ (`vite-plus`) config, the `@kirill.konshin/lint/vite-plus` entry: the same defaults as the ESLint, Prettier
 * and lint-staged configs, expressed as the `lint` (Oxlint), `fmt` (Oxfmt) and `staged` blocks of `vite.config.ts`.
 *
 * `vite-plus` is an optional peer, so this module imports only its types and returns plain objects; the consumer
 * wraps the result in `defineConfig` from `vite-plus` (typescript.md: never import an optional peer at run time).
 * It loads no ESLint plugin: the plugins Oxlint runs as JS plugins are referenced by resolved path, so they load from
 * this package's own install, whatever the consumer's hoisting.
 */

export { tsExts } from './exts.js';

type StagedConfig = NonNullable<UserConfig['staged']>;
type JsPlugin = NonNullable<OxlintConfig['jsPlugins']>[number];

export type VitePlusOptions = {
    detection?: boolean | DetectionOptions;
    next?: boolean | ToggleOptions;
    storybook?: boolean | ToggleOptions;
    turbo?: boolean | ToggleOptions;
    nx?: boolean | ToggleOptions;
    jest?: boolean | ToggleOptions;
    vitest?: boolean | ToggleOptions;
    tailwind?: boolean | TailwindOptions;
    typeAware?: boolean | ToggleOptions;
};

const TS_FILES = `**/*.${tsExts}`;
const TEST_FILES = `**/*.{test,spec}.${tsExts}`;

/**
 * Type-aware `correctness` rules of Oxlint 1.88 that stay off when `typeAware` is on. Tried on this monorepo they
 * reported mostly noise (`act()` with sync callbacks, `for await` over sync iterables, unions with `any`); the
 * other type-aware `correctness` rules stay on — `no-misused-spread`, `no-base-to-string` and `unbound-method` found
 * real bugs (dropped headers, `"[object Object]"` URLs, lost `this`). Re-enable per project in `lint.rules`.
 */
const TYPE_AWARE_CORRECTNESS_OFF = [
    'typescript/await-thenable',
    'typescript/no-floating-promises',
    'typescript/no-redundant-type-constituents',
    'typescript/no-useless-default-assignment',
    'typescript/require-array-sort-compare',
    'typescript/restrict-template-expressions',
];

/** Resolved from this package, so a JS plugin loads even when the consumer does not hoist it. */
function pluginPath(specifier: string): string {
    return fileURLToPath(import.meta.resolve(specifier));
}

/** A workspace-root-relative glob for an absolute directory (Oxlint override globs resolve from the config file). */
function workspaceGlob(dir: string, glob: string): string {
    const rel = relative(findWorkspaceRoot(), dir).replaceAll('\\', '/');
    return rel ? `${rel}/${glob}` : glob;
}

/**
 * Oxlint config: the ESLint config's rules, by Oxlint's names. Each plugin's `recommended` set maps to Oxlint's
 * `correctness` category; the deliberate overrides of the ESLint config are listed rule by rule. Plugins Oxlint has no
 * native port of (Nx, Storybook, Tailwind, Turbo, the local `test-colocation` rule) run as JS plugins.
 *
 * Not carried over: `@nx/dependency-checks` (Oxlint does not lint JSON), `multiline-comment-style` (off anyway),
 * `@typescript-eslint/naming-convention` (type-aware only, off by default), the resolution-dependent `import-x` rules
 * (off anyway). Import sorting moves to Oxfmt (`sortImports`), unused-import removal to `no-unused-vars` with an
 * import autofix.
 */
export function lintConfig(options: VitePlusOptions = {}): OxlintConfig {
    const { enabled: defaultOn = true, strict = false } = asOptions(options.detection);
    // with detection off, tools not mentioned explicitly are OFF instead of auto-detected
    const flag = <T>(option: T | undefined): T | false | undefined =>
        option === undefined && !defaultOn ? false : option;

    /*
     * Native plugins need no package: the gates only decide whether the tool is in use. JS plugins resolve from this
     * package, so no hoisting check either - except the tools whose plugin loads the tool itself.
     */
    const next = toolGate(flag(options.next), strict, {
        tool: 'next',
        has: hasNext,
        requirePackage: false,
        scan: () => findNextRoots(GLOBAL_IGNORES).map((dir) => `${dir}/package.json`),
    });
    const storybook = toolGate(flag(options.storybook), strict, {
        tool: 'storybook',
        has: hasStorybook,
        packageName: 'storybook',
        scan: () => scanWorkspace('.storybook/main.*', GLOBAL_IGNORES, { dot: true }),
    });
    const turbo = toolGate(flag(options.turbo), false, { tool: 'turbo', has: hasTurbo, requirePackage: false });
    const nx = toolGate(flag(options.nx), strict, { tool: 'nx', has: hasNx, packageName: 'eslint' });
    const jest = toolGate(flag(options.jest), strict, {
        tool: 'jest',
        has: hasJest,
        requirePackage: false,
        scan: () => scanWorkspace('jest.config.*', GLOBAL_IGNORES),
    });
    // Vite+ bundles Vitest: on unless turned off
    const vitest = asOptions(flag(options.vitest)).enabled ?? true;
    const tailwind = tailwindGate(flag(options.tailwind), strict);
    // on by default: `vp check` is the type check (TypeScript 7 engine via tsgolint); `vp pack` builds declarations
    // without one. Not a detected tool, so `detection: false` leaves it on
    const { enabled: typeAware = true } = asOptions(options.typeAware);

    const jsPlugins: JsPlugin[] = [{ name: 'local', specifier: pluginPath('@kirill.konshin/lint/oxlint-plugin') }];
    // `@nx/dependency-checks` is not supported: it lints `package.json` through `jsonc-eslint-parser`, and Oxlint reads
    // only JS/TS files and takes no custom parsers, so undeclared imports in a package go unreported
    if (nx.enabled) jsPlugins.push({ name: '@nx', specifier: pluginPath('@nx/eslint-plugin') });

    const overrides: OxlintOverride[] = [
        {
            files: ['**/*.d.ts'],
            rules: {
                // `typeof import('pkg')` annotations are how declaration files name types
                'typescript/consistent-type-imports': [
                    'error',
                    { prefer: 'type-imports', fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
                ],
            },
        },
        {
            files: defaultExportFiles,
            rules: { 'import/no-default-export': 'off' },
        },
        {
            files: [TEST_FILES],
            plugins: [...(vitest ? (['vitest'] as const) : []), ...(jest.enabled ? (['jest'] as const) : [])],
            env: { ...(vitest ? { vitest: true } : {}), ...(jest.enabled ? { jest: true } : {}) },
            rules: {
                'local/test-colocation': 'error',
                ...(vitest
                    ? {
                          'vitest/consistent-test-it': ['error', { fn: 'test' }],
                          'vitest/no-disabled-tests': 'warn',
                          // a `correctness` rule outside the plugin's `recommended` set the ESLint config used
                          'vitest/require-mock-type-parameters': 'off',
                          'vitest/expect-expect': [
                              'error',
                              { assertFunctionNames: ['expect', 'assert', 'expectTypeOf', 'assertType'] },
                          ],
                      }
                    : {}),
                ...(jest.enabled
                    ? { 'jest/consistent-test-it': ['error', { fn: 'test' }], 'jest/no-disabled-tests': 'warn' }
                    : {}),
            },
        },
    ];

    if (storybook.enabled) {
        const specifier = pluginPath('eslint-plugin-storybook');
        overrides.push(
            {
                files: [`**/*.{stories,story}.${tsExts}`],
                jsPlugins: [{ name: 'storybook', specifier }],
                rules: {
                    'react/rules-of-hooks': 'off',
                    'import/no-anonymous-default-export': 'off',
                    'storybook/await-interactions': 'error',
                    'storybook/context-in-play-function': 'error',
                    'storybook/default-exports': 'error',
                    'storybook/hierarchy-separator': 'warn',
                    'storybook/no-redundant-story-name': 'warn',
                    'storybook/no-renderer-packages': 'error',
                    'storybook/prefer-pascal-case': 'warn',
                    'storybook/story-exports': 'error',
                    'storybook/use-storybook-expect': 'error',
                    'storybook/use-storybook-testing-library': 'error',
                },
            },
            {
                files: [`**/.storybook/main.${tsExts}`],
                jsPlugins: [{ name: 'storybook', specifier }],
                rules: { 'storybook/no-uninstalled-addons': 'error' },
            },
        );
    }

    if (tailwind) {
        overrides.push({
            files: [tailwind.packageDir ? workspaceGlob(tailwind.packageDir, TS_FILES) : TS_FILES],
            jsPlugins: [{ name: 'tailwindcss', specifier: pluginPath('eslint-plugin-tailwindcss') }],
            rules: {
                'tailwindcss/classnames-order': 'warn',
                'tailwindcss/enforces-negative-arbitrary-values': 'warn',
                'tailwindcss/enforces-shorthand': 'warn',
                'tailwindcss/important-modifier-suffix': 'warn',
                'tailwindcss/no-custom-classname': 'warn',
                'tailwindcss/no-contradicting-classname': 'error',
                'tailwindcss/no-unnecessary-arbitrary-value': 'warn',
            },
        });
    }

    if (turbo.enabled) {
        overrides.push({
            files: [TS_FILES],
            jsPlugins: [{ name: 'turbo', specifier: pluginPath('eslint-plugin-turbo') }],
            rules: { 'turbo/no-undeclared-env-vars': 'warn' },
        });
    }

    return {
        plugins: [
            'eslint',
            'typescript',
            'unicorn',
            'oxc',
            'import',
            'promise',
            'react',
            'jsx-a11y',
            ...(next.enabled ? (['nextjs'] as const) : []),
        ],
        jsPlugins,
        categories: { correctness: 'error' },
        env: { builtin: true, browser: true, node: true },
        ignorePatterns: GLOBAL_IGNORES,
        settings: {
            react: { version: '19' },
            ...(next.enabled && next.files.length > 0 ? { next: { rootDir: next.files.map(dirname) } } : {}),
            // Settings are global in Oxlint; the plugin needs the entry CSS by absolute path (it resolves a relative
            // one against each linted package)
            ...(tailwind ? { tailwindcss: { cssConfigPath: tailwind.absoluteCssConfigPath } } : {}),
        },
        ...(typeAware ? { options: { typeAware: true, typeCheck: true } } : {}),
        rules: {
            // core
            'no-restricted-imports': [
                'error',
                { paths: [{ name: 'next/router', message: 'Please use next/navigation instead of next/router' }] },
            ],
            /*
             * Autofixable removal of unused imports, as eslint-plugin-unused-imports did. Unused parameters stay
             * allowed (signatures of callbacks and overridable methods), as `@typescript-eslint/no-unused-vars` was
             * off; `_`-prefixed names mark deliberately unused bindings.
             */
            'no-unused-vars': [
                'error',
                {
                    args: 'none',
                    caughtErrors: 'none',
                    ignoreRestSiblings: true,
                    varsIgnorePattern: '^_',
                    fix: { imports: 'safe-fix', variables: 'suggestion' },
                },
            ],
            /*
             * `correctness` rules of the enabled plugins that the ESLint config never enabled: its unicorn set was
             * deliberately two rules, and these were in no `recommended` set it used.
             */
            'unicorn/prefer-string-starts-ends-with': 'off',
            'unicorn/no-useless-spread': 'off',
            'unicorn/no-thenable': 'off',
            'unicorn/no-empty-file': 'off',
            'jsx-a11y/prefer-tag-over-role': 'off',
            'typescript/no-useless-empty-export': 'off',

            // typescript
            'typescript/consistent-type-definitions': ['error', 'type'],
            'typescript/consistent-type-imports': [
                'error',
                { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
            ],
            'typescript/ban-ts-comment': [
                'error',
                {
                    'ts-expect-error': 'allow-with-description',
                    'ts-ignore': true,
                    'ts-nocheck': true,
                    'ts-check': false,
                    minimumDescriptionLength: 3,
                },
            ],
            'typescript/prefer-as-const': 'error',
            'typescript/no-explicit-any': 'off',
            'typescript/no-empty-function': 'off',
            'typescript/no-require-imports': 'off',
            ...(typeAware
                ? {
                      'typescript/prefer-optional-chain': 'warn',
                      'typescript/prefer-nullish-coalescing': 'warn',
                      ...Object.fromEntries(TYPE_AWARE_CORRECTNESS_OFF.map((rule) => [rule, 'off'])),
                  }
                : {}),

            // react + react-hooks (recommended-latest)
            'react/rules-of-hooks': 'error',
            'react/exhaustive-deps': 'warn',
            'react/static-components': 'error',
            'react/use-memo': 'error',
            'react/void-use-memo': 'error',
            'react/preserve-manual-memoization': 'error',
            'react/incompatible-library': 'warn',
            'react/immutability': 'error',
            'react/globals': 'error',
            'react/refs': 'error',
            'react/set-state-in-effect': 'error',
            'react/error-boundaries': 'error',
            'react/purity': 'error',
            'react/set-state-in-render': 'error',
            'react/unsupported-syntax': 'warn',
            'react/react-in-jsx-scope': 'off',
            'jsx-a11y/alt-text': 'off',

            // next
            ...(next.enabled ? { 'nextjs/no-html-link-for-pages': 'off', 'nextjs/no-img-element': 'off' } : {}),
            'import/no-anonymous-default-export': 'off',

            // imports
            'import/no-default-export': 'warn',

            // promise
            'promise/prefer-await-to-then': 'warn',
            'promise/param-names': 'off',
            'promise/always-return': 'off',
            'promise/catch-or-return': 'off',

            // unicorn
            'unicorn/filename-case': [
                'error',
                { case: 'camelCase', ignore: filenameCaseIgnore.map((regex) => regex.source) },
            ],
            'unicorn/prefer-node-protocol': 'error',
        },
        overrides,
    };
}

/**
 * Oxfmt config: the Prettier config (`./prettier`), plus the import order `simple-import-sort` enforced (see
 * typescript.md). Oxfmt reads `.editorconfig`, which Prettier partly ignored, so the Prettier behaviors that differ
 * from an `.editorconfig` are set explicitly (`insertFinalNewline`). `package.json` key order is left alone, as
 * Prettier did. Oxfmt honours `.gitignore` and `.prettierignore`; the `.prettierignore` the README recommended is the
 * default `ignorePatterns`. With `proseWrap: 'never'` a Markdown table is aligned only while it fits `printWidth`, so
 * Markdown gets 200 columns; a wider table is HTML, or stays unaligned when it is mostly code (rules/markdown.md).
 */
export function fmtConfig(): OxfmtConfig {
    return {
        printWidth: 120,
        tabWidth: 2,
        singleQuote: true,
        proseWrap: 'never',
        insertFinalNewline: true,
        sortPackageJson: false,
        ignorePatterns: [
            '.idea',
            '.husky',
            '.yarn',
            // generated, rewritten by their tools: `lint-prepare` + `vp config`, `next build`
            '/AGENTS.md',
            '**/next-env.d.ts',
            // OpenSpec writes these; they stay exactly as `openspec update` leaves them
            '.agents/skills/openspec-*',
            '.claude/skills/openspec-*',
            '.claude/commands/opsx',
        ],
        sortImports: {
            customGroups: [
                {
                    // side effects that must run first: polyfills, and the `server-only` / `client-only` guards a module
                    // must start with (typescript.md)
                    groupName: 'polyfill',
                    selector: 'side_effect',
                    elementNamePattern: [
                        'server-only',
                        'client-only',
                        '**polyfill**',
                        'core-js',
                        'core-js/**',
                        'regenerator-runtime',
                        'regenerator-runtime/**',
                        'whatwg-fetch',
                        '@vitest/web-worker',
                    ],
                },
                { groupName: 'react', elementNamePattern: ['react', 'react/**', 'react-dom', 'react-dom/**'] },
            ],
            // simple-import-sort kept `node:` builtins ahead of packages, and `@/` aliases ahead of relative paths,
            // each pair in one block; a value import of a style file (`css from 'x.css?raw'`) stays with its
            // source, so only side-effect style imports form the style group
            groups: [
                'polyfill',
                'react',
                'builtin',
                { newlinesBetween: false },
                'external',
                'internal',
                { newlinesBetween: false },
                ['subpath', 'parent', 'sibling', 'index'],
                ['side_effect_style', 'side_effect'],
                'unknown',
            ],
        },
        overrides: [
            { files: [`**/${eslintExts}`], options: { tabWidth: 4 } },
            // code blocks in docs are fragments, often alternatives side by side - Prettier never sorted them; tables up
            // to 200 columns stay aligned
            { files: ['**/*.{md,mdx}'], options: { sortImports: false, printWidth: 200 } },
        ],
    };
}

/**
 * Staged-file checks (`vp staged`): what lint-staged ran, as one `vp check --fix` - it formats every file and lints
 * the code files, so no two tasks race on one file.
 */
export function stagedConfig(): StagedConfig {
    return { [`*.{${tsExtsRaw},${markupExtsRaw},${prettierExtsRaw}}`]: 'vp check --fix' };
}

/**
 * The shared Vite+ config: {@link lintConfig}, {@link fmtConfig} and {@link stagedConfig} merged with the consumer's
 * own config. Lists add up (`plugins`, `jsPlugins`, `overrides`, `ignorePatterns`), maps merge key by key (`rules`,
 * `settings`, `env`, ...), and a consumer's `staged` replaces the default. Wrap the result in `defineConfig`:
 *
 * ```ts
 * import { vitePlusConfig } from '@kirill.konshin/lint/vite-plus';
 * import { defineConfig } from 'vite-plus';
 *
 * export default defineConfig(vitePlusConfig({ lint: { rules: { ... } } }));
 * ```
 */
export function vitePlusConfig(config: UserConfig = {}, options: VitePlusOptions = {}): UserConfig {
    const { lint = {}, fmt = {}, staged, ...rest } = config;
    const baseLint = lintConfig(options);
    const baseFmt = fmtConfig();

    return {
        ...rest,
        lint: {
            ...baseLint,
            ...lint,
            plugins: [...new Set([...(baseLint.plugins ?? []), ...(lint.plugins ?? [])])],
            jsPlugins: [...(baseLint.jsPlugins ?? []), ...(lint.jsPlugins ?? [])],
            categories: { ...baseLint.categories, ...lint.categories },
            env: { ...baseLint.env, ...lint.env },
            globals: { ...baseLint.globals, ...lint.globals },
            settings: { ...baseLint.settings, ...lint.settings },
            ...(baseLint.options || lint.options ? { options: { ...baseLint.options, ...lint.options } } : {}),
            ignorePatterns: [...(baseLint.ignorePatterns ?? []), ...(lint.ignorePatterns ?? [])],
            rules: { ...baseLint.rules, ...lint.rules },
            overrides: [...(baseLint.overrides ?? []), ...(lint.overrides ?? [])],
        },
        fmt: {
            ...baseFmt,
            ...fmt,
            ignorePatterns: [...(baseFmt.ignorePatterns ?? []), ...(fmt.ignorePatterns ?? [])],
            overrides: [...(baseFmt.overrides ?? []), ...(fmt.overrides ?? [])],
        },
        staged: staged ?? stagedConfig(),
    };
}
