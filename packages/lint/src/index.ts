import type { Linter } from 'eslint';

import { type LintConfig, resolveLintConfig } from './config.js';
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
import { asOptions } from './lib.js';

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

export * from './config.js';
export * from './exts.js';
export * from './gates.js';
export * from './lib.js';
export * from './restrictions.js';
export * from './lintStaged.js';
export * from './prettier.js';

/**
 * Build the shared flat ESLint config from the workspace root `lint.config.ts` (see `defineLintConfig`), with
 * `overrides` merged over it - per-package differences in a monorepo go here.
 *
 * By default every tool integration is auto-detected (see the `has*` exports); the config forces any of them on/off or
 * supplies tool-specific settings.
 *
 * Returns a Promise - ESLint natively awaits a Promise default export, so a plain `export default eslintConfig()`
 * works; `await` it only when composing with extra blocks.
 */
export async function eslintConfig(overrides: LintConfig = {}): Promise<Linter.Config[]> {
    const options = await resolveLintConfig(overrides);
    const { typeAware, defaultIgnore } = options.eslint ?? {};

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
        ...defaultIgnoreConfig(defaultIgnore),
        // react.js - the whole family (Next or plain React + TS wiring + overrides + settings)
        ...(await reactConfig(flag(options.next), strict)),
        // prettier.js
        ...prettierConfig(),
        // storybook.js
        ...(await storybookConfig(flag(options.storybook), strict)),
        // typescriptTypeAware (should be before imports)
        ...typeAwareConfig(typeAware, strict),
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
