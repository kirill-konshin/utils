# @kirill.konshin/icons

All [FontAwesome free-solid](https://fontawesome.com/icons) icons (+ `FontAwesomeIcon` React component) and all [Gravity UI](https://gravity-ui.com/icons) icon components, re-exported from one package.

```tsx
import { faSignOutAlt, FontAwesomeIcon, Gear } from '@kirill.konshin/icons';

<FontAwesomeIcon icon={faSignOutAlt} />
<Gear />
```

# Tree-Shaking

The barrel is safe when the bundler can split it:

- Next.js: `experimental.optimizePackageImports` must include `@kirill.konshin/icons` — `defineNextConfig` from `@kirill.konshin/next` sets it (see nextjs.md rules)
- Other bundlers: `sideEffects: false` + ESM enable regular tree-shaking
