import react from '@vitejs/plugin-react';
import preserveDirectives from 'rollup-preserve-directives';
import dts from 'vite-plugin-dts';
import { defineConfig } from 'vitest/config';

import {
    checkTypes,
    distDir,
    entry,
    external,
    fixDtsExtensions,
    fixExports,
    formats,
    generateIndex,
    pkg,
} from './vite.exports';

// https://rbardini.com/how-to-build-ts-library-with-vite/
// https://dev.to/receter/how-to-create-a-react-component-library-using-vites-library-mode-4lma

const isWatch = process.argv.includes('--watch'); // https://github.com/vitejs/vite/discussions/7565#discussioncomment-2939256
const isStorybook = process.argv[1]?.includes('storybook') || process.env.STORYBOOK === 'true';
const isUmbrella = pkg.nx?.tags?.includes('platform:umbrella');

export default defineConfig({
    build: {
        ssr: true,
        sourcemap: true,
        outDir: distDir,
        emptyOutDir: !isWatch,
        // target: 'esnext',
        lib: {
            entry,
            formats: Object.keys(formats) as any,
        },
        rollupOptions: {
            external,
            output: {
                preserveModules: true,
                preserveModulesRoot: 'src',
            },
        },
    },
    test: {
        passWithNoTests: true,
        coverage: {
            reporter: ['text', 'html', 'cobertura'],
            include: ['src/**/*.{ts,tsx,js,jsx}'],
        } as any,
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'], // https://vite.dev/guide/performance#reduce-resolve-operations
        preserveSymlinks: true,
    },
    plugins: [
        react(),
        preserveDirectives(), // https://github.com/vitejs/vite/discussions/15721#discussioncomment-10572828
        //TODO Check https://github.com/alloc/vite-dts
        dts({
            beforeWriteFile: (filePath, content) => ({ filePath, content: fixDtsExtensions(filePath, content) }),
        }),
        {
            name: 'Generate Index & Exports',
            async buildStart() {
                if (isWatch || isStorybook || isUmbrella) return;
                await generateIndex();
            },
            async closeBundle() {
                if (isWatch || isStorybook) return;
                await fixExports();
                await checkTypes();
            },
        },
    ],
    server: {
        watch: {
            ignored: ['**/package.json', '**/index.ts'],
        },
    },
});
