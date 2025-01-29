import { defineConfig } from 'tsup';
import { fixExports, formats, includeGlob } from './exports.mjs';

//FIXME https://github.com/egoist/tsup/issues/945 dts is slow
//TODO https://api-extractor.com/pages/setup/invoking/ instead of dts
//TODO https://github.com/egoist/tsup/issues/615 incremental

export default defineConfig({
    outDir: 'dist-tsup',
    entry: [includeGlob],
    format: Object.keys(formats) as any,
    bundle: false,
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: true,
    async onSuccess() {
        // await fixExports();
    },
});
