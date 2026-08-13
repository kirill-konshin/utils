import type { ParserOptions as TsParserOptions } from '@typescript-eslint/parser';
import type { Linter } from 'eslint';
import type { PluginSettings as TailwindPluginSettings } from 'eslint-plugin-tailwindcss';
import type { Configuration as LintStagedConfiguration } from 'lint-staged';
import type { Config as PrettierConfig } from 'prettier';

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

export * from './lib.js';

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
    { enabled: false; importMetaUrl?: string } | { enabled?: true; importMetaUrl: string };

export type LintOptions = {
    detection?: boolean | DetectionOptions;
    next?: boolean | NextOptions;
    storybook?: boolean | ToggleOptions;
    turbo?: boolean | ToggleOptions;
    nx?: boolean | ToggleOptions;
    jest?: boolean | ToggleOptions;
    vitest?: boolean | ToggleOptions;
    tailwind?: boolean | TailwindOptions;
    typeAware?: boolean | TypeAwareOptions;
    defaultIgnore?: boolean | DefaultIgnoreOptions;
};

/**
 * Build the shared flat ESLint config.
 *
 * By default every tool integration is auto-detected (see the `has*` exports); pass
 * {@link LintOptions} to force any of them on/off or to supply tool-specific settings.
 *
 * Returns a Promise - ESLint natively awaits a Promise default export, so a plain
 * `export default defineLintConfig({...})` works; `await` it only when composing with extra blocks.
 *
 */
export async function defineLintConfig(
    options: LintOptions | Promise<LintOptions> | (() => LintOptions | Promise<LintOptions>) = {},
): Promise<Linter.Config[]> {
    if (typeof options === 'function') options = options();
    options = (await options) ?? {};

    /*
     * `detection` uses the same toggle notation as the tool flags (true <> { enabled: true } <>
     * false <> { enabled: false }): `enabled` = are tools ON unless said otherwise (default true),
     * `strict` = same-scope package probes only, no workspace evidence scans (default false;
     * ideal for per-package monorepo configs).
     */
    const { enabled: defaultOn = true, strict = false } = asOptions(options.detection);
    // with detection off, tools not mentioned explicitly are OFF instead of auto-detected
    const flag = <T>(option: T | undefined): T | false | undefined =>
        option === undefined && !defaultOn ? false : option;

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

export const prettier: PrettierConfig = {
    printWidth: 120,
    tabWidth: 2,
    singleQuote: true,
    proseWrap: 'never',
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
 */
export const listStaged: LintStagedConfiguration = {
    [prettierExts]: ['yarn prettier'],
    [eslintExts]: ['yarn eslint', 'yarn prettier'],
};
