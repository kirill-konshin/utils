import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import preserveDirectives from 'rollup-preserve-directives';
import { fixExports, formats, entry, external, distDir, generateIndex } from './vite.exports';

// https://rbardini.com/how-to-build-ts-library-with-vite/
// https://dev.to/receter/how-to-create-a-react-component-library-using-vites-library-mode-4lma

const isWatch = process.argv.includes('--watch'); // https://github.com/vitejs/vite/discussions/7565#discussioncomment-2939256

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
        coverage: {
            reporter: ['text', 'html', 'cobertura'],
        } as any,
    },
    resolve: { extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'] }, // https://vite.dev/guide/performance#reduce-resolve-operations
    plugins: [
        react(),
        preserveDirectives() as Plugin, // https://github.com/vitejs/vite/discussions/15721#discussioncomment-10572828
        dts(), //TODO Check https://github.com/alloc/vite-dts
        {
            name: 'Generate Index & Exports',
            async buildStart() {
                if (!isWatch) await generateIndex();
            },
            async closeBundle() {
                if (!isWatch) await fixExports(); //FIXME + CHECK TYPES
            },
        },
    ],
    server: {
        watch: {
            ignored: ['**/package.json', '**/index.ts'],
        },
    },
});
