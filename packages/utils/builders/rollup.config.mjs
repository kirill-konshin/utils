import { globSync } from 'glob';
import dts from 'vite-plugin-dts';
import resolve from '@rollup/plugin-node-resolve';
import swc from '@rollup/plugin-swc';
import commonjs from '@rollup/plugin-commonjs';
import del from 'rollup-plugin-delete';
import multi from '@rollup/plugin-multi-entry';
import { fixExports, excludeGlob, includeGlob, entryGlob, entry, external } from './exports.mjs';

//FIXME https://github.com/rollup/rollup/issues/4629 watch spits all files
//FIXME https://github.com/rollup/rollup/issues/3150 watch spits all files
//FIXME Multi produces virtual files

const dir = 'dist-rollpup';

/** @type {import('rollup').RollupOptions} */
const config = {
  // input: includeGlob, // multi
  // input: entryGlob, // multi
  input: entry, // glob array, seems to be a bit faster
  // ignore: excludeGlob,
  output: {
    dir,
    preserveModules: true,
    preserveModulesRoot: 'src',
    sourcemap: true,
    format: 'es',
  },
  external,
  onwarn(warning, warn) {
    if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
    warn(warning);
  },
  plugins: [
    del({ targets: dir, runOnce: true }),
    swc(),
    commonjs(),
    resolve({ extensions: ['.ts', '.tsx'] }),
    dts({ outDir: dir }), // exclude: excludeGlob,
    // multi({ preserveModules: true }),
    {
      name: 'Generate Exports',
      async buildEnd() {
        // await fixExports();
      },
    },
  ],
};

export default config;
