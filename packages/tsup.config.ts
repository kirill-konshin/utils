import { defineConfig } from 'tsup';

import fs from 'node:fs/promises';
import path from 'node:path';

export default defineConfig({
    entry: ['src/**/*.ts', 'src/**/*.tsx'],
    format: ['cjs', 'esm'],
    bundle: false,
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: true,
    async onSuccess() {
        const formats = { types: 'd.ts', require: 'cjs', import: 'mjs' }; // order is important
        const distDir = './dist/';

        const pkgPath = path.join(process.cwd(), 'package.json');
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));

        const modules = (await fs.readdir(path.join(process.cwd(), 'src'))).filter(
            (file) => (file.endsWith('.ts') || file.endsWith('.tsx')) && !file.includes('.stories.'),
        );

        pkg.exports = modules.reduce((exportsEntry, entry) => {
            const file = entry.replace(/\.[jt]sx?$/, '');

            const key = './' + file;

            exportsEntry[key] = Object.entries(formats).reduce((exportEntry, [format, ext]) => {
                exportEntry[format] = `${distDir}${file}.${ext}`;
                return exportEntry;
            }, {});

            return exportsEntry;
        }, {});

        pkg.exports['.'] = pkg.exports['./index'];
        delete pkg.exports['./index'];

        pkg.type = 'module';
        pkg.main = `${distDir}index.js`;
        pkg.module = `${distDir}index.js`;
        pkg.types = `${distDir}index.d.ts`;

        pkg.publishConfig = { access: 'public' };
        pkg.author = 'Kirill Konshin <kirill@konshin.org> (https://konshin.org)';
        pkg.license = 'MIT';

        pkg.scripts.clean = 'rm -rf .tscache dist';
        pkg.scripts.build = 'tsup';
        pkg.scripts['build:index'] = 'cti create ./src';
        pkg.scripts.start = 'yarn build --watch';
        pkg.scripts.wait = `wait-on ${distDir}index.js`;

        await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));

        console.log('Updated package.json with exports', pkg);
    },
});
