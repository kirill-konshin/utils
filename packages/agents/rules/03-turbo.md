# Turbo

Packages are built using [Turbo](https://turbo.build/repo). Turbo is used to manage dependencies and run tasks.

## The `dependsOn: ["^wait"]` Pattern

The `start:demo` task uses `"dependsOn": ["^wait"]` to coordinate startup order in watch mode:

```json
{
    "start:demo": {
        "persistent": true,
        "cache": false,
        "dependsOn": ["^wait"]
    }
}
```

**How it works:**

1. `^wait` runs the `wait` task on all dependency packages first
2. `wait` script uses `wait-on ./dist/index.js` to block until the dist file exists
3. Library packages run `start` (build --watch) which produces `dist/index.js`
4. Once the file exists, `wait-on` unblocks and the demo can start

**Why not `dependsOn: ["^build"]`?**

- `build` in watch mode never "completes" (it's persistent)
- `wait` only checks for file existence, so it unblocks after the first successful build
- Subsequent rebuilds don't block the demo

This pattern ensures demos don't try to import from libraries before they're built, while still allowing hot-reload development.

## Turbo Task Consistency

ALWAYS verify turbo.json task definitions when modifying scripts or package structure:

1. **Task inheritance**: Common tasks like `build`, `clean`, `test`, `start`, `wait` should be defined in root `turbo.json` and inherited by all packages
2. **Package turbo.json**: Only override when needed (e.g., adding `dependsOn` or custom `outputs`)
3. **Check `dependsOn`**: Ensure build dependencies match actual package dependencies (e.g., `"dependsOn": ["^build"]` for packages that depend on other workspace packages)
4. **Check `outputs`**: Must include all build artifacts (`dist/**/*`, `package.json` if modified, generated files)
5. **Cache settings**: `clean`, `wait`, `start` should have `"cache": false`
