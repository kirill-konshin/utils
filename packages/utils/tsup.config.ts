import { defineConfig } from 'tsup';
import { fixExports, entryGlob, formats } from './exports';

export default defineConfig({
    entry: [entryGlob],
    format: Object.keys(formats) as any,
    bundle: false,
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: true,
    async onSuccess() {
        await fixExports();
    },
});
