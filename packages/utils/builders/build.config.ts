import { BuildConfig } from 'unbuild';
import { entry, entryGlob, external, fixExports, formats, includeGlob } from './exports.mjs';

export default {
    entries: entry,
    declaration: true,
    clean: true,
    outDir: 'dist-unbuild',
    externals: external,
    failOnWarn: false,
} satisfies BuildConfig;
