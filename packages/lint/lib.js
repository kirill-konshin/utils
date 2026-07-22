import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

//TODO coverage, dist, out, build?
export const GLOBAL_IGNORES = [
    '**/next-env.d.ts',
    '**/viteEnv.d.ts',
    '**/node_modules',
    '**/.cache',
    '**/.nx',
    '**/.turbo',
    '**/.yarn',
];

/**
 * Capability gate: is a package installed in the consumer's project?
 *
 * @param {string} specifier e.g. `'next/package.json'` - probe package.json, importing the real entry could have side effects
 * @returns {boolean}
 */
export function isPackageResolvable(specifier) {
    try {
        import.meta.resolve(specifier);
        return true;
    } catch {
        return false;
    }
}

/**
 * Detect a workspace by walking up from cwd to a marker file (e.g. `nx.json`). Unlike a bare cwd
 * check this is stable across subdirectory / per-package / IDE runs - they all resolve to the same
 * workspace root - and correctly stays negative outside such a workspace.
 *
 * The walk is bounded by the git root: a workspace marker can't meaningfully live above `.git`, and
 * stopping there prevents a stray marker file elsewhere on the disk (e.g. in the home directory)
 * from switching the gate on. `.git` is a directory in a normal clone but a FILE in worktrees and
 * submodules - existsSync covers both.
 *
 * @param {string} fileName marker file, e.g. `'nx.json'`
 * @returns {boolean}
 */
export function hasWorkspaceFile(fileName) {
    let dir = process.cwd();
    for (;;) {
        if (existsSync(resolve(dir, fileName))) return true;
        if (existsSync(resolve(dir, '.git'))) return false;
        const parent = dirname(dir);
        if (parent === dir) return false;
        dir = parent;
    }
}
