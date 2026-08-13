import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Linter } from 'eslint';

export const TAILWIND_ENTRY = '@import "tailwindcss";\n';

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

export const tailwindBlockOf = (config: Linter.Config[]): Linter.Config | undefined =>
    config.find((block) => block.settings?.tailwindcss);
export const nextSettingsBlockOf = (config: Linter.Config[]): Linter.Config | undefined =>
    config.find((block) => block.settings?.next);
export const hasNextPluginIn = (config: Linter.Config[]): boolean =>
    config.some((block) => block.plugins?.['@next/next']);
export const hasNxRuleIn = (config: Linter.Config[]): boolean =>
    config.some((block) => block.rules?.['@nx/dependency-checks']);
