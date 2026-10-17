import * as path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';

import { checkTypes, distDir, entry, fixExports, generateIndex, pkg } from './vite.exports';

const isWatch = process.argv.includes('--watch');
const isStorybook = process.argv[1]?.includes('storybook') || process.env.STORYBOOK === 'true';
const isVitest = process.env.VITEST === 'true'; // index/exports/attw are build-time codegen; under vitest cwd may be the workspace root
const isUmbrella = pkg.nx?.tags?.includes('platform:umbrella');

export default defineConfig({
    /*
     * `vp pack` (tsdown on Rolldown): ESM only, one output file per source module (`unbundle`, the old
     * `preserveModules`), declarations from `isolatedDeclarations` (tsconfig.json). Every bare import stays
     * external, as the static list of dependencies, builtins and `@kirill.konshin/*` did. Module directives
     * (`'use client'`) survive in unbundled output.
     */
    pack: {
        entry,
        outDir: distDir,
        format: 'esm',
        platform: 'node',
        unbundle: true,
        fixedExtension: false,
        sourcemap: true,
        dts: true,
        clean: !isWatch,
        deps: { neverBundle: true },
        hooks: {
            async 'build:prepare'() {
                if (isWatch || isStorybook || isVitest || isUmbrella) return;
                await generateIndex();
            },
            async 'build:done'() {
                if (isWatch || isStorybook || isVitest) return;
                await fixExports();
                await checkTypes();
            },
        },
    },
    test: {
        passWithNoTests: true,
        // Nx runs several packages at once (NX_PARALLEL), so a Vitest inside an Nx task takes half of the cores; a direct
        // run (IDE, `vp test` in a package) takes all of them
        maxWorkers: process.env.NX_TASK_TARGET_PROJECT ? '50%' : '100%',
        setupFiles: [path.join(__dirname, 'vitest.setup.ts')], // absolute: setupFiles resolve against each project's root
        coverage: {
            reporter: ['text', 'html', 'cobertura'],
            include: ['src/**/*.{ts,tsx,js,jsx}'],
        },
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'], // https://vite.dev/guide/performance#reduce-resolve-operations
        preserveSymlinks: true,
    },
    // Storybook and Vitest only - `vp pack` transforms JSX itself
    plugins: [react()],
    server: {
        watch: {
            ignored: ['**/package.json', '**/index.ts'],
        },
    },
});
