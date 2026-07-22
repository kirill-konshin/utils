// Raw JS like the rest of the package (see README "Why raw JS"). Without a package-local config,
// vitest walks up to the monorepo root config, whose `projects: ['packages/*']` glob resolves
// against cwd and finds nothing when run from inside this package.
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {},
});
