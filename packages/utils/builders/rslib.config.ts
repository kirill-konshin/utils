import { defineConfig } from '@rslib/core';
import type { RsbuildPlugin } from '@rsbuild/core';
import { fixExports, generateIndex, includeGlob } from './vite.exports';

//FIXME https://github.com/egoist/tsup/issues/945 dts is slow
//TODO https://api-extractor.com/pages/setup/invoking/ instead of dts
//TODO https://github.com/egoist/tsup/issues/615 incremental

export default defineConfig({
    lib: [{ bundle: false, format: 'esm', dts: { bundle: false } }],
    source: { entry: { index: includeGlob } },
    output: { sourceMap: true, cleanDistPath: true, distPath: { root: 'dist-rslib' } },
    plugins: [
        // {
        //     name: 'Generate Index & Exports',
        //     setup(api) {
        //         api.onBeforeBuild(async () => {
        //             await generateIndex();
        //         });
        //         api.onAfterBuild(async () => {
        //             await fixExports();
        //         });
        //     },
        // } satisfies RsbuildPlugin,
    ],
});
