import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Linter } from 'eslint';

export const TAILWIND_ENTRY = '@import "tailwindcss";\n';

type TailwindBlock = Linter.Config & { settings: { tailwindcss: { cssConfigPath: string } } };
type NextBlock = Linter.Config & { settings: { next: { rootDir: string | string[] } } };

/**
 * Run `fn` with cwd pointed at a throwaway dir containing `files` (nested paths allowed) -
 * workspace-anchored scans (findTailwindEntry, findNextRoots, .gitignore) must not see the
 * monorepo's own files. `PROJECT_CWD` (the cheapest source findWorkspaceRoot accepts) is pointed
 * at the temp dir too, using the REAL path: `process.cwd()` resolves the `/var` → `/private/var`
 * symlink on macOS and the containment check compares paths literally. The `has*` capability
 * probes are module-load-time and unaffected.
 *
 */
export async function inTempDir<T>(files: Record<string, string>, fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = mkdtempSync(join(tmpdir(), 'lint-config-test-'));
    const previousCwd = process.cwd();
    const previousProjectCwd = process.env.PROJECT_CWD;
    try {
        for (const [name, content] of Object.entries(files)) {
            mkdirSync(join(dir, dirname(name)), { recursive: true });
            writeFileSync(join(dir, name), content);
        }
        process.chdir(dir);
        process.env.PROJECT_CWD = process.cwd();
        return await fn(dir);
    } finally {
        process.chdir(previousCwd);
        if (previousProjectCwd === undefined) delete process.env.PROJECT_CWD;
        else process.env.PROJECT_CWD = previousProjectCwd;
        rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * Third-party modules a fresh Node process loads to import the built `dist/<entry>` - a load hook records every URL.
 */
export function packagesLoadedBy(entry: string): string[] {
    const script = [
        "import { registerHooks } from 'node:module';",
        'const loaded = [];',
        'registerHooks({ load: (url, context, nextLoad) => (loaded.push(url), nextLoad(url, context)) });',
        `await import(${JSON.stringify(new URL(`../dist/${entry}`, import.meta.url).href)});`,
        'console.log(JSON.stringify(loaded));',
    ].join('\n');
    const loaded: string[] = JSON.parse(
        execFileSync(process.execPath, ['--input-type=module', '--eval', script], { encoding: 'utf8' }),
    );
    return loaded.filter((url) => url.includes('/node_modules/'));
}

/** The block carrying the Tailwind plugin's settings; a test that asks for it fails here when there is none. */
export function tailwindBlockOf(config: Linter.Config[]): TailwindBlock {
    const block = config.find((candidate) => candidate.settings?.tailwindcss);
    assert.ok(block, 'tailwind block expected');
    return block as TailwindBlock;
}

/** The block carrying `@next/next`'s settings; a test that asks for it fails here when there is none. */
export function nextSettingsBlockOf(config: Linter.Config[]): NextBlock {
    const block = config.find((candidate) => candidate.settings?.next);
    assert.ok(block, 'next settings block expected');
    return block as NextBlock;
}

export const hasTailwindBlockIn = (config: Linter.Config[]): boolean =>
    config.some((block) => block.settings?.tailwindcss);
export const hasNextSettingsIn = (config: Linter.Config[]): boolean => config.some((block) => block.settings?.next);
export const hasNextPluginIn = (config: Linter.Config[]): boolean =>
    config.some((block) => block.plugins?.['@next/next']);
export const hasNxRuleIn = (config: Linter.Config[]): boolean =>
    config.some((block) => block.rules?.['@nx/dependency-checks']);
