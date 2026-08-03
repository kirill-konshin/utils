# @kirill.konshin/next

Next.js utilities: `AppLink`, `NoSSR`, `redirect`, `SoftLink`, `useIsInner`, `measure` and the base config.

# `defineNextConfig`

Base `next.config.ts` with recommended defaults: `cacheComponents`, `typedRoutes`, `experimental.typedEnv`, `reactStrictMode: false` and an exhaustive `experimental.optimizePackageImports` list (MUI, Toolpad, FontAwesome, Gravity UI, lodash, Hero UI, react-bootstrap, `@kirill.konshin/icons` — extra entries are ignored by Next.js, missing ones cost dev startup and bundle size).

```ts
// next.config.ts
import { defineNextConfig } from '@kirill.konshin/next';

export default defineNextConfig(); // just the defaults
```

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
