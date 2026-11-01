---
name: next
description: What `@kirill.konshin/next` provides - `defineNextConfig` for `next.config.ts` (the `/config` subpath; what it sets, how to extend it) and the utilities `AppLink`, `SoftLink`, `NoSSR`, `useIsInner` / `useIsIndex`, `measurer`. Use when writing or changing `next.config.ts`, or before writing an active link, a search-param link, a client-only wrapper or build timing logs by hand.
---

# `next.config.ts`

Use `defineNextConfig` from `@kirill.konshin/next/config`, the `/config` subpath, NEVER the main entry: Next.js transpiles `next.config.ts` to CommonJS and `require`s it outside any bundler, and `/config` loads nothing but Next.js types.

It sets `cacheComponents`, `typedRoutes`, `experimental.typedEnv`, `reactStrictMode: false` and an exhaustive `experimental.optimizePackageImports` list (`@mui/*`, `@toolpad/core`, `@fortawesome/*`, `@gravity-ui/*`, `lodash`, `@heroui/react`, `react-bootstrap`, `@kirill.konshin/icons`, …). An extra entry costs nothing; a missing one costs dev startup time and bundle size.

The callback receives the defaults and returns the final config: merge explicitly.

```ts
import { defineNextConfig } from '@kirill.konshin/next/config';

export default defineNextConfig((defaults) => ({
    ...defaults,
    transpilePackages: ['my-lib'],
    experimental: {
        ...defaults.experimental,
        optimizePackageImports: [...(defaults.experimental?.optimizePackageImports ?? []), 'my-barrel-lib'],
    },
}));
```

# Utilities (main entry)

- `AppLink`: `next/link` with `activeClassName` when the current path matches (`exact` for an exact match); `useIsLinkActive()` for the same check without a link
- `SoftLink`: a link that changes the search params through the native History API, without a rerender of the page
- `NoSSR`: renders its children only in the browser. Prefer `dynamic(() => import('./x'), { ssr: false })`: it also removes the import from the server bundle
- `useIsInner()` / `useIsIndex()`: whether the current page is below the layout or the layout's own index
- `measurer`: colored timing logs for build and server code (`measurer.measure(what, step).done()`); `isProd` is true in the production build and server phases
- `Redirect` is deprecated: use `redirect()` of `next/navigation`
