# ESLint + Prettier + Lint Staged + Husky

## Installation

```bash
$ yarn add -D eslint prettier @kirill.konshin/eslint-config-next-custom husky lint-staged
```

### PNPM

https://eslint.org/docs/latest/use/getting-started#manual-set-up

```dotenv
auto-install-peers=true
node-linker=hoisted
```

## Settings

`eslint.config.mjs`:

```js
import { defineConfig } from 'eslint/config';
import customConfig, { nextPlugin, includeIgnoreFile, tsExts } from '@kirill.konshin/eslint-config-next-custom';

export default defineConfig([
    ...customConfig,
    {
        files: [`**/*.${tsExts}`],
        plugins: {
            next: nextPlugin,
        },
        settings: {
            next: {
                rootDir: process.cwd() + '/path/to/next-app',
            },
        },
    },
    {
        name: 'Custom rules',
        rules: {
            // overrides
        },
    },
    includeIgnoreFile(import.meta.url, '.gitignore'),
    includeIgnoreFile(import.meta.url, '.prettierignore'),
]);
```

`.prettierrc.mjs`:

```js
import { prettier } from '@kirill.konshin/eslint-config-next-custom';
export default prettier;
```

or

```js
import { prettier } from '@kirill.konshin/eslint-config-next-custom';

export default {
    ...prettier,
    // overrides
};
```

`package.json`:

```json5
{
    scripts: {
        eslint: 'eslint --fix --concurrency=auto --cache --cache-location node_modules/.cache/eslint', // to see files use --debug
        prettier: 'prettier --write --log-level=warn --ignore-path .gitignore --ignore-path .prettierignore', // to see files use --log-level=log
        lint: 'yarn eslint . && yarn prettier .',
        'lint:staged': 'lint-staged',
    },
}
```

## IDEA settings:

- Eslint: `**/*.{js,jsx,ts,tsx,cjs,cts,mjs,mts,htm,html,md,mdx,vue}`
- Prettier: `{**/*}.{js,jsx,ts,tsx,cjs,cts,mjs,mts,htm,html,md,mdx,css,scss,sass,less,yml,yaml,json}`

## Lint Staged

`.lintstagedrc.mjs`

```js
import { listStagedConfig } from '@kirill.konshin/eslint-config-next-custom';
export default listStagedConfig();
```

## Husky

`package.json`:

```json5
{
    scripts: {
        prepare: 'husky || next types || true',
    },
}
```

`.husky/pre-commit`:

```bash
#!/bin/zsh
source ~/.zshrc # for VSCode terminal
yarn lint:staged
```

## Issues

- ESLint 9
    - [x] https://github.com/microsoft/rushstack/issues/4635 Failed to patch ESLint because the calling module was not recognized
    - [x] https://github.com/microsoft/rushstack/issues/4965 Failed to patch ESLint because the calling module was not recognized
- ESLint 10
    - [ ] https://github.com/vercel/next.js/issues/89764 TypeError: Error while loading rule 'react/display-name': contextOrFilename.getFilename is not a function
    - [x] `import/no-default-export` (eslint-plugin-import@2.32.0) crashes every lint run under ESLint 10's
          flat config - its `sourceType()` helper reads `context.parserOptions`, which is `undefined` (not
          `{}`) there. Worked around by registering `eslint-plugin-import-x` (a drop-in replacement) under
          its own `import-x` key - see the "eslint-plugin-import-x" block in `index.js` - since ESLint 10
          hard-errors ("Cannot redefine plugin") if you try to reuse the `import` key eslint-config-next
          already registers. The enforced rule is therefore `import-x/no-default-export`, not `import/*`.
