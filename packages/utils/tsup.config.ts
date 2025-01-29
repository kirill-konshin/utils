import { defineConfig } from 'tsup';

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as process from 'node:process';

const formats = { cjs: ['require', 'cjs', 'd.ts'], esm: ['import', 'js', 'd.cts'] }; // order is important

const distDir = './dist';

const pkgPath = path.join(process.cwd(), 'package.json');

export default defineConfig({
    entry: ['src/**/*.ts', 'src/**/*.tsx'],
    format: Object.keys(formats) as any,
    bundle: false,
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: true,
    async onSuccess() {
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));

        const modules = (await fs.readdir(path.join(process.cwd(), 'src'))).filter((file) => !file.includes('.'));

        pkg.exports = {};

        // https://johnnyreilly.com/dual-publishing-esm-cjs-modules-with-tsup-and-are-the-types-wrong
        // https://www.npmjs.com/package/@arethetypeswrong/cli
        // FIXME https://github.com/andrewbranch/example-subpath-exports-ts-compat/tree/main
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

            // await fs.mkdir(path.join(process.cwd(), entry));
            // await fs.writeFile(path.join(process.cwd(), entry, 'package.json', JSON.stringify({
            //     type: 'module',
            //     main: `../${distDir}/${entry}/index.cjs`,
            //     module: `../${distDir}/${entry}/index.js`,
            //     types: `../${distDir}/${entry}/index.d.ts`,
            // }, null, 2)));
        }

        const core = pkg.exports['./core'];

        pkg.exports['.'] = core;

        pkg.type = 'module';
        pkg.main = core.require.require;
        pkg.module = core.import.import;
        pkg.types = core.import.types;

        pkg.publishConfig = { access: 'public' };
        pkg.author = 'Kirill Konshin <kirill@konshin.org> (https://konshin.org)';
        pkg.license = 'MIT';

        pkg.scripts.clean = 'rm -rf .tscache dist';
        pkg.scripts.build = 'tsup';
        pkg.scripts['build:index'] = 'cti create ./src/*';
        pkg.scripts.start = 'yarn build --watch';
        pkg.scripts.wait = `wait-on ${core.import.import}`;

        await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));

        console.log('Updated package.json with exports', pkg, pkg.exports);
    },
});
