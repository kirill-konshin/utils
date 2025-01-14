# ESLint + Prettier + Lint Staged + Husky

## Installation

```bash
$ yarn add -D eslint @eslint-compat prettier @kirill.konshin/eslint-config-next-custom husky lint-staged
```

`eslint.config.mjs`:

```js
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { includeIgnoreFile } from '@eslint/compat';
import customConfig from '@kirill.konshin/eslint-config-next-custom';

const gitignorePath = resolve(dirname(fileURLToPath(import.meta.url)), '.prettierignore'); // <----- !!!

const config = [
    ...customConfig,
    {
        name: 'Custom rules',
        rules: {
            // overrides
        },
    },
    includeIgnoreFile(gitignorePath),
];

export default config;
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
        eslint: 'DEBUG=eslint:eslint eslint --cache --cache-location node_modules/.cache/eslint --fix',
        prettier: 'prettier --write',
        'lint:all': 'yarn eslint . && yarn prettier .',
    },
}
```

IDEA settings:

- Eslint: `**/*.{js,jsx,ts,tsx,cjs,cts,mjs,mts,htm,html,md,mdx,vue}`
- Prettier: `{**/*}.{js,jsx,ts,tsx,cjs,cts,mjs,mts,htm,html,md,mdx,css,scss,sass,less,yml,yaml,json}`

## Lint Staged

```json5
{
    '*.{js,jsx,ts,tsx,cjs,cts,mjs,mts,htm,html,md,mdx,vue}': 'yarn eslint',
    '*.{js,jsx,ts,tsx,cjs,cts,mjs,mts,htm,html,md,mdx,css,scss,sass,less,yml,yaml,json}': 'yarn prettier',
}
```

## Husky

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

- [x] https://github.com/microsoft/rushstack/issues/4635 Failed to patch ESLint because the calling module was not recognized
- [x] https://github.com/microsoft/rushstack/issues/4965 Failed to patch ESLint because the calling module was not recognized
