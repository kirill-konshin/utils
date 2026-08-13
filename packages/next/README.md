# @kirill.konshin/next

Next.js utilities: `AppLink`, `NoSSR`, `redirect`, `SoftLink`, `useIsInner`, `measure` (main entry) and the base config (`/config` entry).

# `defineNextConfig` — `@kirill.konshin/next/config`

Base `next.config.ts` with recommended defaults: `cacheComponents`, `typedRoutes`, `experimental.typedEnv`, `reactStrictMode: false` and an exhaustive `experimental.optimizePackageImports` list (MUI, Toolpad, FontAwesome, Gravity UI, lodash, Hero UI, react-bootstrap, `@kirill.konshin/icons` — extra entries are ignored by Next.js, missing ones cost dev startup and bundle size).

```ts
// next.config.ts
import { defineNextConfig } from '@kirill.konshin/next/config';

export default defineNextConfig(); // just the defaults
```

Import from `/config`, not from the main entry: `next.config.ts` is transpiled to CommonJS and `require`d by Next.js outside any bundler, and the `/config` module pulls in nothing but Next's own types — the main entry would drag the React components in with it.

The callback receives the defaults and returns the final config — merge explicitly:

```ts
export default defineNextConfig((defaults) => ({
    ...defaults,
    transpilePackages: ['@kirill.konshin/react'],
    experimental: {
        ...defaults.experimental,
        optimizePackageImports: [...(defaults.experimental?.optimizePackageImports ?? []), 'my-barrel-lib'],
    },
}));
```
