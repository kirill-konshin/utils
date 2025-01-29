import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { fixExports, pkg, formats, entry } from './exports.mjs';

// https://rbardini.com/how-to-build-ts-library-with-vite/
export default defineConfig({
    build: {
        ssr: true,
        sourcemap: true,
        emptyOutDir: true,
        target: 'esnext',
        lib: {
            entry,
            formats: Object.keys(formats) as any,
        },
        rollupOptions: {
            external: [/node_modules/, /^node:.*/],
            output: {
                preserveModules: true,
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
