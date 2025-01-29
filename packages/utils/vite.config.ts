import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { fixExports, pkg, formats, entry } from './exports';

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
            external: [
                ...Object.keys(pkg.peerDependencies),
                ...Object.keys(pkg.dependencies),
                'react/jsx-runtime',
                /^node:.*/,
            ],
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
                await fixExports();
            },
        },
    ],
});
