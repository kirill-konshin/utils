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
import customConfig, { nextPlugin, includeIgnoreFile } from '@kirill.konshin/eslint-config-next-custom';

export default defineConfig([
    ...customConfig,
    {
        files: ['**/*.{js,jsx,ts,tsx}'],
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
    includeIgnoreFile(import.meta.url, '.prettierignore'),
]);
```

`.prettierrc.mjs`:

```js
import config from '@kirill.konshin/eslint-config-next-custom/prettier';

export default {
    ...config,
    // overrides
};
```

`package.json`:

```json5
{
    scripts: {
        eslint: 'eslint --fix --concurrency=auto --cache --cache-location node_modules/.cache/eslint', // to see files use --debug
        prettier: 'prettier --write --log-level=warn', // to see files use --log-level=log
        'lint:all': 'yarn eslint . && yarn prettier .',
        'lint:staged': 'lint-staged',
    },
}
```

## IDEA settings:

- Eslint: `**/*.{js,jsx,ts,tsx,cjs,cts,mjs,mts,htm,html,md,mdx,vue}`
- Prettier: `{**/*}.{js,jsx,ts,tsx,cjs,cts,mjs,mts,htm,html,md,mdx,css,scss,sass,less,yml,yaml,json}`

## Lint Staged

`.lintstagedrc`

```json5
{
    '*.{js,jsx,ts,tsx,cjs,cts,mjs,mts,htm,html,md,mdx,vue}': 'yarn eslint',
    '*.{js,jsx,ts,tsx,cjs,cts,mjs,mts,htm,html,md,mdx,css,scss,sass,less,yml,yaml,json}': 'yarn prettier',
}
```

## Husky

`package.json`:

```json5
{
    scripts: {
        prepare: 'husky install',
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
