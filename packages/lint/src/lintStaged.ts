import type { Configuration as LintStagedConfiguration } from 'lint-staged';

import { markupExtsRaw, prettierExtsRaw, tsExts } from './exts.js';

/**
 * Shared lint-staged config, the `@kirill.konshin/lint/lint-staged` entry. Import it from there, not the package root:
 * the root loads every ESLint plugin, which would slow down each commit.
 *
 * Markup goes to Prettier only: no block of this config lints it, so ESLint would skip it with a warning, after its
 * full startup.
 *
 * Tasks run the `eslint` / `prettier` package.json scripts (README), so their flags live in one place, through
 * `node --run` rather than `yarn`: Yarn loads the whole project state before every script, seconds per commit.
 *
 * https://nextjs.org/docs/app/api-reference/config/eslint#running-lint-on-staged-files
 *
 * Pay extra attention when the configured globs overlap, and tasks make edits to files. Prettier and eslint might try
 * to make changes to the same *.ts file at the same time, causing a race condition.
 *
 * https://github.com/lint-staged/lint-staged?tab=readme-ov-file#reformatting-the-code
 * https://github.com/lint-staged/lint-staged/issues/775
 * You don't need git add since lint-staged 10
 */
export const listStaged: LintStagedConfiguration = {
    [`*.{${prettierExtsRaw},${markupExtsRaw}}`]: ['node --run prettier --'],
    [`*.${tsExts}`]: ['node --run eslint --', 'node --run prettier --'],
};
