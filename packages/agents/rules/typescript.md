---
type: always_apply
description: Set of rules for projects with tests
paths:
    - '**/*.js'
    - '**/*.mjs'
    - '**/*.cjs'
    - '**/*.ts'
    - '**/*.tsx'
---

- ALL projects must use TypeScript by default
    - JavaScript is acceptable for service scripts, but discouraged, use `ts-node`
- ALL configs should use TypeScript if possible via `defineConfig` or at least import TS type for configuration.
- Prefer short-circuit evaluation and early exit
- Use structured logging with context, consider adding function arguments to log:
    - `console.log('[MODULE] FuncionName did something', { isDev, appPath, useStaticInDev });`
    - `console.log('[APP] Static Server', fileUrl, '->', filePath);`
- Prefer Optional Chaining `onClose?.();` or `options?.signal?.addEventListener('abort', ...)` instead `if`s or ternaries
- Prefer Nullish Coalescing `id ?? 'default'` instead of ternaries like `!!id ? id : 'default`

# Preferred TypeScript settings for modern projects

- `isolatedDeclarations: true`: USE ONLY FOR PUBLISHED LIBRARIES, enables faster declaration emit and requires explicit type annotations on exports
    - In such case all exported functions and variables must have explicit type annotations:
- `strictNullChecks: true`: Null and undefined are distinct types
- `moduleResolution: "bundler"`
- `jsx: "react-jsx"`: Modern JSX transform (no React default import needed)

# File Structure

- One-time use functions should stay in the same file they are used
- If function is really large, then it can be extracted
- Organize code in files in this order:
    1. Imports
    2. Types/Interfaces
    3. Constants
    4. Helper functions (private)
    5. Main exports (classes, functions, components)

# Functions

- Use arrow functions for:
    - Short utility functions
    - Callbacks
    - Exported simple functions
- Use function declarations for:
    - Complex functions with multiple statements
    - Functions that need hoisting
    - Named functions inside closures
    - React Components

# Naming Conventions

- Use `camelCase` for variables and functions
- Use descriptive names that indicate purpose
- Prefix boolean variables with `is`, `has`, `can`, `should`
- Use `UPPER_SNAKE_CASE` for constants
- Use `export const UNUSED: unique symbol = Symbol('UNUSED');` for genuinely unique identifiers
- Use `PascalCase` for class names
- Use descriptive names ending with purpose: `TransformerMap`, `WorkerDialog`, `RespondersBase`

# Import/export

- Never use `index.ts` files for re-exporting unless specifically instructed or working with a published library with entrypoint
- Always use named exports `export function Foo()`
- Prefer not to use default exports if not necessary (like Storybook `meta`)
- Prefer path aliases: `@/src/foo/bar/file`
- Import siblings directly `./file.ts`
- Do not import more than one level up: `../file` OK, but not preferred
    - NOT OK: more than one level `../../file` or stepping aside from parent dir `../dir/file`

# Type Annotation Patterns

- Use `interface` only for declaration merging/augmentation (e.g. extending a third-party global
  interface) - a class can `implements` a `type` alias just as well, so that's not a reason to reach
  for `interface`
    - This is enforced by lint (`@typescript-eslint/consistent-type-definitions`), which can't special-case
      augmentation - when it's genuinely needed, add
      `// eslint-disable-next-line @typescript-eslint/consistent-type-definitions` above the `interface`
- Prefer to inline types into function signature or variable declarations
- Introduce types when reused or complex. Avoid creating a type for every single thing
- Try to reuse types that exist in project (e.g. redux state, zod schema, component props, final function signature can have one shared type + derivatives like `Omit<>`, `Partial<>` etc.)
- Use the `cause` option for error context `throw new Error('Unknown responder', { cause: ctx });`
- Use `//TODO` for later items and `//FIXME` for actionable more urgent items, no space after `//`
- When types are critical add type assertions, if super critical - runtime type assertions
- Prefer `as const` and `readonly` for immutable constants and objects
