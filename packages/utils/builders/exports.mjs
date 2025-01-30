import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as process from 'node:process';
import { globSync } from 'glob';

export const pkgPath = path.join(process.cwd(), 'package.json');

export const distDir = './dist';

//TODO Re-read in fixExports
// import pkg from './package.json' assert { type: 'json' };
// export { pkg };
export const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));

export const formats = {
  // cjs: ['require', 'js', 'd.ts'],
  esm: ['import', 'mjs', 'd.ts'],
};

export const entryGlob = 'src/*/index.ts';
export const excludeGlob = 'src/**/*.{stories,test}.{ts,tsx}';
export const includeGlob = 'src/**/!(*.stories|*.test).{ts,tsx}';
export const foldersGlob = 'src/*/';

export const external = [
  ...[...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)].map((dep) => new RegExp(`^${dep}(/.*)?`)),
  /node_modules/,
  /^node:.*/,
  /builder-util-runtime/,
];

export const entry = globSync(entryGlob);

export async function fixExports() {
  const modules = globSync(foldersGlob).map((file) => path.basename(file));

  pkg.exports = {};

  // https://johnnyreilly.com/dual-publishing-esm-cjs-modules-with-tsup-and-are-the-types-wrong
  // https://www.npmjs.com/package/@arethetypeswrong/cli
  // FIXME https://github.com/andrewbranch/example-subpath-exports-ts-compat
  for (const entry of modules) {
    const key = `./${entry}`;

    pkg.exports[key] = {};

    for (const [format, ext, type] of Object.values(formats)) {
      const fileName = `${distDir}/${entry}/index`;

      pkg.exports[key][format] = {
        [format]: `${fileName}.${ext}`,
        types: `${fileName}.${type}`,
      };
    }
  }

  const core = pkg.exports['./core'];

  pkg.exports['.'] = core;

  pkg.type = 'module';
  pkg.main = pkg.module = core.import.import;
  // pkg.main = core.require.require;
  pkg.types = core.import.types;

  pkg.publishConfig = { access: 'public' };
  pkg.author = 'Kirill Konshin <kirill@konshin.org> (https://konshin.org)';
  pkg.license = 'MIT';

  // pkg.scripts.clean = 'rm -rf .tscache dist';
  // pkg.scripts.build = 'tsup';
  // pkg.scripts['build:index'] = 'cti create ./src/*';
  // pkg.scripts.start = 'yarn build --watch';
  pkg.scripts.wait = `wait-on ${core.import.import}`;

  await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));

  console.log('Updated package.json with exports');
  // console.log(pkg);
  // console.log(pkg.exports);
}

if (process.env.FIX) await fixExports();
