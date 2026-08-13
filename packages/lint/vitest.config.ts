// Without a package-local config, Vitest walks up to the monorepo root config, whose
// `projects: ['packages/*']` glob resolves against cwd and finds nothing from this package.
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {},
});
