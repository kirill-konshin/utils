import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { globSync } from 'glob';
import { execSync } from 'node:child_process';

export const pkgPath = path.join(process.cwd(), 'package.json');

export const distDir = './dist';

//TODO Re-read in fixExports
// import pkg from './package.json' assert { type: 'json' };
// export { pkg };
export const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

export const rootPkg = JSON.parse(fs.readFileSync(path.resolve('../../package.json'), 'utf-8'));

export const formats = {
    // cjs: ['require', 'cjs', 'd.ts'],
    esm: ['import', 'js', 'd.ts'],
};

export const entryGlob = 'src/*/index.ts';
export const excludeGlob = 'src/**/*.{stories,test,fixture}.{ts,tsx}';
export const includeGlob = 'src/**/!(*.stories|*.test,fixture).{ts,tsx}';
export const foldersGlob = 'src/*/';

export const external = [
    ...[...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)].map(
        (dep) => new RegExp(`^${dep}(/.*)?`),
    ),
    /node_modules/,
    /^node:.*/,
    /builder-util-runtime/,
];

export const entry = globSync(entryGlob);

export async function fixExports() {
    const modules = globSync(foldersGlob).map((file) => path.basename(file));

    // Exports

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

    // Main

    pkg.type = 'module';
    pkg.main = pkg.module = core.import.import;
    pkg.types = core.import.types;

    // Author & License

    // TODO Move to root build + set private=true for demos + set react version
    pkg.publishConfig = { access: 'public' };
    pkg.author = 'Kirill Konshin <kirill@konshin.org> (https://konshin.org)';
    pkg.license = 'MIT';

    // Scripts

    // pkg.scripts.clean = 'rm -rf dist .tscache tsconfig.tsbuildinfo';
    // pkg.scripts.build = 'vite build';
    // pkg.scripts.start = 'yarn build --watch';
    pkg.scripts.wait = `wait-on ${core.import.import}`;

    // Ensure peer deps are correct & meta is set

    pkg.peerDependenciesMeta = {};

    for (const [key, _] of Object.entries(pkg.peerDependencies)) {
        const root = rootPkg.devDependencies[key]; // lifted to root
        const srcPkg = root ? rootPkg : pkg;

        if (!srcPkg.devDependencies[key]) throw new Error(`Key ${key} not found in dependencies`);

        pkg.peerDependenciesMeta[key] = { optional: true };

        const version = srcPkg.devDependencies[key].split('.');

        pkg.peerDependencies[key] = version[0] === '^0' ? `${version[0]}.${version[1]}` : version[0];
    }

    // Write

    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

    console.log('Updated package.json with exports');
    // console.log(pkg);
    // console.log(pkg.exports);
}

export async function generateIndex() {
    execSync(`yarn build:index`, { stdio: 'inherit' }); // programmatic call
    //FIXME https://github.com/imjuni/create-ts-index/issues/70
    // import { TypeScritIndexWriter } from 'create-ts-index';
    // const tsiw = new TypeScritIndexWriter();
    // const options = TypeScritIndexWriter.getDefaultOption('./src');
    // await tsiw.createEntrypoint(option);
}
