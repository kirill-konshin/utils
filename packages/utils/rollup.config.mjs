import { globSync } from 'glob';
import dts from 'vite-plugin-dts';
import resolve from '@rollup/plugin-node-resolve';
import swc from '@rollup/plugin-swc';
import commonjs from '@rollup/plugin-commonjs';
import multi from '@rollup/plugin-multi-entry';
import { apiExtractor } from 'rollup-plugin-api-extractor';
import { fixExports, pkg, pkgPath } from './exports.mjs';

//FIXME https://github.com/rollup/rollup/issues/4629 watch spits all files
//FIXME https://github.com/rollup/rollup/issues/3150 watch spits all files

/** @type {import('rollup').RollupOptions} */
const config = {
  // input: 'src/**/*.{ts,tsx}',
  // input: 'src/*/index.ts',
  input: globSync('src/**/!(*.stories|*.test).{ts,tsx}'),
  // ignore: 'src/**/*.{stories,test}.{ts,tsx}',
  external: [/node_modules/, /^node:.*/],
  output: {
    dir: 'dist',
    preserveModules: true,
    preserveModulesRoot: 'src',
    sourcemap: true,
    format: 'es',
  },
  onwarn(warning, warn) {
    if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
    warn(warning);
  },
  plugins: [
    swc(),
    commonjs(),
    resolve({ extensions: ['.ts', '.tsx'] }),
    // apiExtractor({
    //   configuration: {
    //     projectFolder: '.',
    //     mainEntryPointFilePath: 'dist/index.d.ts',
    //     compiler: {
    //       tsconfigFilePath: 'tsconfig.json',
    //     },
    //   },
    // }),
    dts({ exclude: ['node_modules/**', 'src/**/*.{stories,test}.{ts,tsx}'], outDir: 'dist' }),
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
