/*
 * Raw ESM JS on purpose (no TS build): loaded by `eslint.config.mjs` and pre-commit `lint:staged`
 * before anything is built, so a `dist/` main would need building before it could lint. See
 * README ("Why raw JS"). Types live in the hand-written `index.d.ts` next to this file, which
 * pulls real types from the underlying packages; the option types (LintOptions, NextOptions,
 * TailwindOptions) are defined ONLY there and referenced from JSDoc via import() aliases - keep
 * the function signatures in sync with the JSDoc here.
 *
 * The config is built by `defineLintConfig(options)`, which is pure ordering: every block lives in a
 * themed `configs/*.js` file as an exported `*Config()` function, and the tool-gated ones take
 * their own defineLintConfig flag (`undefined` auto-detect / `true` or options force on / `false` off)
 * and gate themselves - see the detection block in lib.js for why forcing exists. Tool-gated
 * plugins are imported
 * lazily inside their block functions so consumers without the tool don't pay their load cost;
 * the plugin re-exports below follow module-load DETECTION (not defineLintConfig options, which they
 * cannot see) and are null when the tool wasn't detected.
 */
import { baseConfig, defaultIgnoreConfig } from './configs/base.js';
import { importSortConfig, importXConfig, unusedImportsConfig } from './configs/imports.js';
import { nxConfig } from './configs/nx.js';
import { prettierConfig } from './configs/prettier.js';
import { promiseConfig } from './configs/promise.js';
import { reactConfig } from './configs/react.js';
import { storybookConfig } from './configs/storybook.js';
import { tailwindConfig } from './configs/tailwind.js';
import { jestConfig, testConfig, vitestConfig } from './configs/testing.js';
import { turboConfig } from './configs/turbo.js';
import { typeAwareConfig } from './configs/typescriptTypeAware.js';
import { unicornConfig } from './configs/unicorn.js';
import { asOptions, eslintExts, prettierExts } from './lib.js';

export * from './configs/base.js';
export * from './configs/imports.js';
export * from './configs/react.js';
export * from './configs/nx.js';
export * from './configs/prettier.js';
export * from './configs/promise.js';
export * from './configs/storybook.js';
export * from './configs/tailwind.js';
export * from './configs/testing.js';
export * from './configs/turbo.js';
export * from './configs/typescriptTypeAware.js';
export * from './configs/unicorn.js';

// deliberately NOT the whole lib.js - asOptions/GLOBAL_IGNORES and the fs helpers stay internal
export {
    // extensions
    tsExts,
    tsExtsRaw,
    eslintExts,
    eslintExtsRaw,
    prettierExts,
    prettierExtsRaw,
    // detection
    findWorkspaceRoot,
    scanWorkspace,
    hasJest,
    hasNext,
    hasNx,
    hasStorybook,
    hasTailwind,
    hasTurbo,
    hasVite,
    hasVitest,
} from './lib.js';

/** @typedef {import('./index.js').LintOptions} LintOptions Per-tool toggles - defined once in index.d.ts (resolved via the sibling declaration file), backed by real upstream types. */

/**
 * Build the shared flat ESLint config.
 *
 * By default every tool integration is auto-detected (see the `has*` exports); pass
 * {@link LintOptions} to force any of them on/off or to supply tool-specific settings.
 *
 * Returns a Promise - ESLint natively awaits a Promise default export, so a plain
 * `export default defineLintConfig({...})` works; `await` it only when composing with extra blocks.
 *
 * @param {LintOptions | Promise<LintOptions> | (() => LintOptions | Promise<LintOptions>)} [options]
 * @returns {Promise<import('eslint').Linter.Config[]>}
 */
export async function defineLintConfig(options = {}) {
    if (typeof options === 'function') options = options();
    options = (await options) ?? {};

    /*
     * `detection` uses the same toggle notation as the tool flags (true <> { enabled: true } <>
     * false <> { enabled: false }): `enabled` = are tools ON unless said otherwise (default true),
     * `strict` = same-scope package probes only, no workspace scans / symlink bridges (default
     * false; ideal for per-package monorepo configs).
     */
    const { enabled: defaultOn = true, strict = false } = asOptions(options.detection);
    // with detection off, tools not mentioned explicitly are OFF instead of auto-detected
    const flag = (option) => (option === undefined && !defaultOn ? false : option);

    // blocks from the same configs/* file stay consecutive - ordering inside a family matters
    // (e.g. next: base config, then the TS wiring stemming from it, then overrides, then settings)
    return [
        // base.js
        ...baseConfig(),
        ...defaultIgnoreConfig(options.defaultIgnore),
        // react.js - the whole family (Next or plain React + TS wiring + overrides + settings)
        ...(await reactConfig(flag(options.next), strict)),
        // prettier.js
        ...prettierConfig(),
        // storybook.js
        ...(await storybookConfig(flag(options.storybook), strict)),
        // typescriptTypeAware (should be before imports)
        ...typeAwareConfig(options.typeAware, strict),
        // imports.js
        ...importXConfig(),
        ...importSortConfig(),
        ...unusedImportsConfig(),
        // promise.js
        ...promiseConfig(),
        // unicorn.js
        ...unicornConfig(),
        // turbo.js
        ...(await turboConfig(flag(options.turbo))),
        // tailwind.js
        ...(await tailwindConfig(flag(options.tailwind), strict)),
        // nx.js
        ...(await nxConfig(flag(options.nx), strict)),
        // testing.js
        ...jestConfig(flag(options.jest), strict),
        ...vitestConfig(flag(options.vitest), strict),
        ...testConfig(),
    ];
}

/** @type {import('prettier').Config} */
export const prettier = {
    printWidth: 120,
    tabWidth: 2,
    singleQuote: true,
    overrides: [
        {
            files: eslintExts,
            options: {
                tabWidth: 4,
            },
        },
    ],
};

/**
 * https://nextjs.org/docs/app/api-reference/config/eslint#running-lint-on-staged-files
 *
 * Pay extra attention when the configured globs overlap, and tasks make edits to files. Prettier and eslint might try
 * to make changes to the same *.ts file at the same time, causing a race condition.
 *
 * https://github.com/lint-staged/lint-staged?tab=readme-ov-file#reformatting-the-code
 * https://github.com/lint-staged/lint-staged/issues/775
 * You don't need git add since lint-staged 10
 *
 * TODO Screw yarn, just use eslint directly? Yarn gives greater control over what is in the console...
 *
 * @type {import('lint-staged').Configuration}
 */
export const listStaged = {
    [prettierExts]: ['yarn prettier'],
    [eslintExts]: ['yarn eslint', 'yarn prettier'],
};
