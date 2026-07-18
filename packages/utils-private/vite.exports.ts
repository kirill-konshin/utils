import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
import { execSync } from 'node:child_process';
import { globSync } from 'glob';
import { createRequire } from 'node:module';
import { checkPackage, createPackageFromTarballData, type Problem } from '@arethetypeswrong/core';
import { problemKindInfo } from '@arethetypeswrong/core/problems';

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

export const entryGlob = 'src/index.ts';
export const excludeGlob = 'src/**/*.{stories,test,fixture}.{ts,tsx}';
export const includeGlob = 'src/**/!(*.stories|*.test,fixture).{ts,tsx}';
export const foldersGlob = 'src/*/';

export const external = [
    ...[...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})].map(
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

    //FIXME Entries, formats, etc.
    const mainExport = (pkg.exports['.'] = {
        import: {
            import: './dist/index.js',
            types: './dist/index.d.ts',
        },
    });

    pkg.exports['.'] = mainExport;

    // Main

    pkg.type = 'module';
    pkg.main = pkg.module = mainExport.import.import;
    pkg.types = mainExport.import.types;

    /*
     * Without `files`, npm pack falls back to .npmignore/.gitignore — and dist/ is gitignored, so
     * published tarballs would contain only the auto-included entrypoint, none of the preserved
     * per-module files the exports map points at (checkTypes catches this as resolution errors).
     */
    pkg.files = ['dist'];

    // Author & License

    // TODO Move to root build + set private=true for demos + set react version
    pkg.publishConfig = { access: 'public' };
    pkg.author = 'Kirill Konshin <kirill@konshin.org> (https://konshin.org)';
    pkg.license = 'MIT';

    // Scripts

    // pkg.scripts.clean = 'rm -rf dist .tscache tsconfig.tsbuildinfo';
    // pkg.scripts.build = 'vite build';
    // pkg.scripts.start = 'yarn build --watch';
    pkg.scripts.wait = `wait-on ${mainExport.import.import}`; // artifact presence detector, see "wait" target in nx.json

    // Ensure peer deps are correct & meta is set
    // Empty peerDependenciesMeta is inert and yarn strips it on manifest rewrites,
    // so it must only be present when there are peer dependencies

    const peerDependencies = Object.entries(pkg.peerDependencies || {});

    if (peerDependencies.length === 0) {
        delete pkg.peerDependenciesMeta;
    } else {
        pkg.peerDependenciesMeta = {};

        for (const [key, _] of peerDependencies) {
            const root = rootPkg.devDependencies[key]; // lifted to root
            const srcPkg = root ? rootPkg : pkg;

            if (!srcPkg.devDependencies?.[key]) throw new Error(`Key ${key} not found in devDependencies`);

            pkg.peerDependenciesMeta[key] = { optional: true };

            const version = srcPkg.devDependencies[key].split('.');

            pkg.peerDependencies[key] = version[0] === '^0' ? `${version[0]}.${version[1]}` : version[0];
        }
    }

    // Write

    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

    console.log('Updated package.json with exports');
    // console.log(pkg);
    // console.log(pkg.exports);
}

/**
 * ┌───────────────┬─────────────────────────────────────────────┐
 * │    version    │                   result                    │
 * ├───────────────┼─────────────────────────────────────────────┤
 * │ 2.6.4 – 2.7.0 │ correct (one line per file)                 │
 * ├───────────────┼─────────────────────────────────────────────┤
 * │ 2.7.1 – 2.7.3 │ duplicated cache line 3x, but no data loss  │
 * ├───────────────┼─────────────────────────────────────────────┤
 * │ 2.7.4         │ crashes (ENOENT)                            │
 * ├───────────────┼─────────────────────────────────────────────┤
 * │ 2.7.5 – 2.8.1 │ silently drops sibling files (what you hit) │
 * └───────────────┴─────────────────────────────────────────────┘
 *
 * Console output in later versions: ctix.Debugger.it.enable = true
 */
export async function generateIndex() {
    const ctix = createRequire(import.meta.url)('ctix');

    // ctix's `creating(buildOptions, createOption)` ignores its first argument entirely (it's
    // unused dead code in ctix's implementation), so only a single, fully-formed `createOption`
    // matters here - there's nothing to parse/cast via parseConfig().
    const options = {
        mode: 'create' as never,
        project: 'tsconfig.json',
        include: 'src/**/*.{ts,tsx}',
        exclude: ['**/*.stories.*', '**/*.test.*', '**/*.fixture.*'],
        startFrom: 'src',
        exportFilename: 'index.ts', // required: without it ctix joins dirPath + undefined => EISDIR on the bare dir
        quote: "'", // rendered verbatim into generated files, must not be left undefined
        useSemicolon: true,
        backup: false,
        overwrite: true,
        generationStyle: 'default-alias-named-star',
        skipEmptyDir: false,
        verbose: true, // unused by ctix.creating() itself, kept for documentation of intent
    };

    // 2.6.4 has no verbose flag - Spinner/ProgressBar/Reasoner default to disabled and are only
    // enabled by ctix's own CLI wrapper (buildCommand), which we bypass by calling creating() directly.
    ctix.ProgressBar.it.enable = true;
    ctix.Spinner.it.enable = true;
    ctix.Reasoner.it.enable = true;

    try {
        await ctix.creating(undefined, options as any);
    } finally {
        ctix.ProgressBar.it.stop();
        ctix.Spinner.it.stop();
    }
}

/*
 * TS emits relative import specifiers into .d.ts verbatim — extensionless, as written in source —
 * but node16/nodenext ESM resolution requires explicit paths ('./worker.js', './form/index.js').
 * Runtime output is already correct (rollup appends '.js'), so only declarations need the rewrite.
 * The src tree (mirrored 1:1 into dist via preserveModules) decides file vs directory — dist itself
 * may be only partially emitted when this hook runs.
 */
export function fixDtsExtensions(filePath: string, content: string): string {
    if (!/\.d\.[cm]?ts$/.test(filePath)) return content;

    const fileSrcDir = path.dirname(path.join(path.resolve('./src'), path.relative(path.resolve(distDir), filePath)));

    return content.replace(/(\bfrom\s+|\bimport\s*\()(['"])(\.\.?\/[^'"]+)\2/g, (match, prefix, quote, spec) => {
        const target = path.resolve(fileSrcDir, spec);

        if (fs.existsSync(`${target}.ts`) || fs.existsSync(`${target}.tsx`))
            return `${prefix}${quote}${spec}.js${quote}`;
        if (fs.existsSync(path.join(target, 'index.ts'))) return `${prefix}${quote}${spec}/index.js${quote}`;

        return match; // already extensioned, non-source asset, or outside src — leave untouched
    });
}

/*
 * Mirrors `attw --profile esm-only`: these packages deliberately ship ESM only (exports maps carry
 * just an `import` condition), so failures of the require-based resolutions are expected, not defects.
 */
const ignoredResolutionKinds = ['node10', 'node16-cjs'];

function formatProblem(problem: Problem): string {
    const { kind, entrypoint, resolutionKind, resolutionOption, fileName, moduleSpecifier } = problem as any;
    const info = problemKindInfo[kind];

    const where = [
        entrypoint !== undefined && `entrypoint "${entrypoint}"`,
        (resolutionKind ?? resolutionOption) && `resolution ${resolutionKind ?? resolutionOption}`,
        fileName && `file ${fileName}`,
        moduleSpecifier && `import "${moduleSpecifier}"`,
    ]
        .filter(Boolean)
        .join(', ');

    return `${info.emoji} ${info.title} (${where || JSON.stringify(problem)}): ${info.shortDescription}. ${info.docsUrl}`;
}

export async function checkTypes() {
    // https://www.npmjs.com/package/@arethetypeswrong/core
    const { filename } = JSON.parse(execSync('npm pack --json', { encoding: 'utf-8' }))[0];

    try {
        const data = new Uint8Array(fs.readFileSync(filename));
        const analysis = await checkPackage(createPackageFromTarballData(data));

        const problems = analysis.types
            ? analysis.problems.filter((p: any) => !ignoredResolutionKinds.includes(p.resolutionKind))
            : [];

        if (problems.length > 0) {
            // TODO Throw instead of warn once existing packages' dts extension issues are fixed
            for (const problem of problems) console.warn(formatProblem(problem));

            console.warn(`@arethetypeswrong found ${problems.length} problem(s) in ${pkg.name}`);
        } else {
            console.log('Types check passed');
        }
    } finally {
        fs.rmSync(filename);
    }
}
