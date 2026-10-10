import * as fs from 'node:fs';
import { defineConfig, type UserConfig } from 'tsdown';

type Plugin = Extract<NonNullable<UserConfig['plugins']>, { name: string }>;

/** Vite's `?raw` import — a file's text as its default export — for the bundle; Vitest reads the source with Vite. */
const raw: Plugin = {
    name: 'raw',
    async resolveId(source, importer) {
        if (!source.endsWith('?raw')) return null;
        const resolved = await this.resolve(source.slice(0, -'?raw'.length), importer);
        return resolved && `${resolved.id}?raw`;
    },
    load(id) {
        return id.endsWith('?raw')
            ? `export default ${JSON.stringify(fs.readFileSync(id.slice(0, -'?raw'.length), 'utf8'))};`
            : null;
    },
};

/**
 * The library's declarations are resolved as Node resolves the package at run time, which is how they always named
 * the types of the CommonJS plugins they re-export.
 */
const NODE_DECLARATIONS = { compilerOptions: { module: 'nodenext', moduleResolution: 'nodenext' } } as const;

/**
 * Two builds. The library — ESLint, Prettier, lint-staged and Yarn configs and `lint-prepare` — one file per source
 * module with its declarations, its dependencies left to the consumer's install. `spec-tools` — spec-steward and the
 * audits in one self-contained file, `skills/spec-tools/scripts/cli.js`, so a CI job that has only the package's files
 * runs it with no install; `typescript` alone stays external, loaded only by the commands that read source (`scope`,
 * `changed`).
 */
export default defineConfig([
    {
        entry: ['src/**/*.ts', '!src/**/*.test.ts', '!src/testUtils.ts', '!src/yarn.cts'],
        outDir: 'dist',
        platform: 'node',
        format: 'esm',
        fixedExtension: false,
        unbundle: true,
        dts: NODE_DECLARATIONS,
    },
    {
        entry: ['src/yarn.cts'],
        outDir: 'dist',
        platform: 'node',
        format: 'cjs',
        dts: NODE_DECLARATIONS,
        clean: false,
    },
    {
        entry: { cli: 'spec-tools/src/cli.ts' },
        outDir: 'skills/spec-tools/scripts',
        platform: 'node',
        format: 'esm',
        fixedExtension: false,
        dts: false,
        // One file: the skills and a CI job name it, so no chunk may sit beside it.
        outputOptions: { codeSplitting: false },
        deps: { neverBundle: ['typescript'], alwaysBundle: ['jsonrepair', 'marked', 'github-markdown-css'] },
        plugins: [raw],
    },
]);
