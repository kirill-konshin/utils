# TypeScript

General TypeScript rules are provided by `@kirill.konshin/agents` package.
See: `packages/agents/rules/04-typescript.md`

The following are repo-specific conventions. All packages extend root `tsconfig.json`.

## Compiler Options

Key TypeScript settings used across the codebase:

- `isolatedDeclarations: true` - Enables faster declaration emit and requires explicit type annotations on exports
- `strictNullChecks: true` - Null and undefined are distinct types
- `strict: false` - Not using full strict mode, but strictNullChecks is enabled
- `moduleResolution: "bundler"` - Modern bundler-compatible resolution
- `jsx: "react-jsx"` - Modern JSX transform (no React import needed)
