import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { fixExports, formats, entry, external, distDir, generateIndex } from './vite.exports';

// https://rbardini.com/how-to-build-ts-library-with-vite/
// https://dev.to/receter/how-to-create-a-react-component-library-using-vites-library-mode-4lma

export default defineConfig({
    build: {
        ssr: true,
        sourcemap: true,
        outDir: distDir,
        emptyOutDir: true,
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
        dts(), //TODO Check https://github.com/alloc/vite-dts
        {
            name: 'Generate Index & Exports',
            async buildStart() {
                await generateIndex();
            },
            async closeBundle() {
                await fixExports();
            },
        },
    ],
});
