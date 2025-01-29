import { defineConfig } from 'tsup';
import { fixExports, entryGlob, formats } from './exports.mjs';

//FIXME https://github.com/egoist/tsup/issues/945 dts is slow
//TODO https://api-extractor.com/pages/setup/invoking/ instead of dts

export default defineConfig({
    entry: [entryGlob],
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
