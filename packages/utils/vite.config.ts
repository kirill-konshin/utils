import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { fixExports, formats, entry, external } from './exports.mjs';

// https://rbardini.com/how-to-build-ts-library-with-vite/

export default defineConfig({
    build: {
        ssr: true,
        sourcemap: true,
        outDir: './dist-vite',
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
    plugins: [
        react(),
        dts(),
        {
            name: 'Generate Exports',
            async buildEnd() {
                // await fixExports();
            },
        },
    ],
});
