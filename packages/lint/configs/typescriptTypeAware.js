import { isAbsolute, relative } from 'node:path';

import { asOptions, findWorkspaceRoot } from '../lib.js';

/** @typedef {import('../index.js').TypeAwareOptions} TypeAwareOptions Defined in index.d.ts. */

/**
 * Type-aware rules. Off by default (FIXME: does not perform) - enable via
 * `defineLintConfig({ typeAware: true })` or by composing this block manually; it is self-contained
 * (wires typescript-eslint's projectService itself).
 *
 * Config files like vite.config.ts and .storybook/{main,preview}.ts sit at the package root or in
 * a dotfolder, outside their tsconfig.json `include` - projectService has no tsconfig to attach
 * them to. `allowDefaultProject` falls back to a synthetic single-file program for these instead
 * of erroring; it has NO default (the layout is project-specific and its patterns may not contain
 * `**` - see README "Type-aware rules" for how to generate the list).
 * `maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING` defaults to the length of
 * `allowDefaultProject` when that list is given (upstream default is 8), and `tsconfigRootDir`
 * defaults to the detected workspace root.
 *
 * @param {boolean | TypeAwareOptions} [option] the defineLintConfig `typeAware` flag; there is
 *   nothing to auto-detect, so only an explicit `true` / options object enables the block
 * @returns {import('eslint').Linter.Config[]}
 */
export function typeAwareConfig(option, strict = false) {
    let {
        enabled = false,
        allowDefaultProject,
        // matches the list when it's exact files (the scanWorkspace flow); with multi-match globs
        // set the cap explicitly - typescript-eslint errors loudly when matches exceed it
        maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING = allowDefaultProject?.length,
        // strict detection avoids the workspace walk
        tsconfigRootDir = strict ? process.cwd() : findWorkspaceRoot(),
    } = asOptions(option);
    if (!enabled) return [];

    // typescript-eslint requires allowDefaultProject globs to be RELATIVE to tsconfigRootDir -
    // absolute entries (e.g. produced by scanWorkspace, see README) are relativized automatically
    allowDefaultProject = allowDefaultProject?.map((file) =>
        isAbsolute(file) ? relative(tsconfigRootDir, file) : file,
    );

    return [
        {
            name: 'Type-aware rules (separate for performance)',
            files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts', '**/*.mdx'],
            languageOptions: {
                parserOptions: {
                    projectService: {
                        ...(allowDefaultProject ? { allowDefaultProject } : {}),
                        ...(maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING
                            ? { maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING }
                            : {}),
                    },
                    tsconfigRootDir,
                },
            },
            rules: {
                '@typescript-eslint/prefer-optional-chain': 'warn',
                '@typescript-eslint/prefer-nullish-coalescing': 'warn',

                /**
                 * https://typescript-eslint.io/rules/naming-convention/
                 *
                 * Naming Conventions. Lives here (not 'Custom
                 * rules') because the `types: ['boolean']` filter below needs type info too, even
                 * though naming-convention as a whole isn't in the typed-linting rule set.
                 */
                '@typescript-eslint/naming-convention': [
                    'warn',
                    { selector: 'default', format: null },
                    /*
                     * PascalCase allowed too: this codebase's actual
                     * convention is `const Cmp: FC<Props> = memo(...)` - components are PascalCase
                     * variables, not just PascalCase function declarations.
                     */
                    {
                        selector: 'variable',
                        format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
                        leadingUnderscore: 'forbid',
                    },
                    {
                        selector: 'variable',
                        types: ['boolean'],
                        /*
                         * The part AFTER the prefix is naturally capitalized (isLoading, hasError, ...),
                         * so it's validated as PascalCase, not camelCase - format here is for the suffix,
                         * not the identifier as a whole.
                         */
                        format: ['PascalCase'],
                        prefix: ['is', 'has', 'had', 'can', 'should', 'will', 'did'],
                    },
                    /*
                     * Established exceptions to the boolean-prefix rule above - conventional enough on
                     * their own (React's own `loading`/`done` state names, DOM/library `enabled` flags)
                     * that requiring is/has/can/should here would just be noise.
                     */
                    {
                        selector: 'variable',
                        types: ['boolean'],
                        filter: { regex: '^(done|loading|enabled)$', match: true },
                        format: ['camelCase'],
                    },
                    { selector: 'function', format: ['camelCase', 'PascalCase'] },
                    { selector: 'class', format: ['PascalCase'] },
                ],
            },
        },
    ];
}
