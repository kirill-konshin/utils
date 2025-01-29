import { Glob, build } from 'bun';
import dts from 'bun-plugin-dts';
import { entry, external } from './exports.mjs';

const results = await build({
    entrypoints: entry,
    publicPath: '',
    sourcemap: 'linked',
    outdir: 'dist-bun',
    plugins: [dts({})],
    target: 'node',
    external,
    format: 'esm',
});

if (results.success == false) {
    console.error('Build failed');
    for (const message of results.logs) {
        console.error(message);
    }
} else {
    console.log('Compiled ' + results.outputs.length + ' javascript files...');
}
