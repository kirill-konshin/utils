/** The few git reads steward needs; every one degrades to "nothing" outside a repository. */
import { execFileSync } from 'node:child_process';

/** @returns stdout, or null when git fails */
export function git(cwd: string, args: string[]): string | null {
    try {
        return execFileSync('git', args, {
            cwd,
            encoding: 'utf8',
            maxBuffer: 256 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
    } catch {
        return null;
    }
}

/** Answers a process asks more than once (git can be slow on a large or busy worktree). */
const memo = new Map();

const once = <T>(key: string, read: () => T): T => {
    if (!memo.has(key)) memo.set(key, read());
    return memo.get(key);
};
/** Forget what git answered, before a run that must see the tree as it is now. */
export const forget = () => memo.clear();

/** Repository root containing `dir`, or null. */
export const toplevel = (dir: string) =>
    once(`toplevel:${dir}`, () => git(dir, ['rev-parse', '--show-toplevel'])?.trim() || null);

/** Tracked plus untracked-but-not-ignored files, repository-relative; null when git cannot list them. */
export function listFiles(root: string): string[] | null {
    return once(`files:${root}`, () => {
        const out = git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
        return out === null ? null : [...new Set(out.split('\0').filter(Boolean))];
    });
}

/** A file's content at a ref, or null when it did not exist there. */
export const show = (root: string, ref: string, file: string) => git(root, ['show', `${ref}:${file}`]);

/** Many files' contents at a ref in one git process; a file absent there maps to null. */
export function showMany(root: string, ref: string, files: string[]): Map<string, string | null> {
    const out = new Map(files.map((f) => [f, null as string | null]));
    if (!files.length) return out;
    let buf;
    try {
        buf = execFileSync('git', ['cat-file', '--batch'], {
            cwd: root,
            input: files.map((f) => `${ref}:${f}\n`).join(''),
            maxBuffer: 256 * 1024 * 1024,
            stdio: ['pipe', 'pipe', 'ignore'],
        });
    } catch {
        return out;
    }
    let at = 0;
    for (const file of files) {
        const eol = buf.indexOf(10, at);
        if (eol < 0) break;
        const header = buf.subarray(at, eol).toString('utf8');
        at = eol + 1;
        const size = /^[0-9a-f]+ blob (\d+)$/.exec(header)?.[1];
        if (size === undefined) continue;
        out.set(file, buf.subarray(at, at + Number(size)).toString('utf8'));
        at += Number(size) + 1;
    }
    return out;
}

/** The commit a ref names, or null when the repository has no such object. */
export const commitOf = (root: string, ref: string) =>
    git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])?.trim() || null;

/** The merge base of `ref` and HEAD — what a branch is compared against — or `ref` itself when there is none. */
export const mergeBase = (root: string, ref: string) => git(root, ['merge-base', ref, 'HEAD'])?.trim() || ref;

/** Files under `dir` at `ref`. */
export function filesAt(root: string, ref: string, dir: string) {
    const out = git(root, ['ls-tree', '-r', '--name-only', '-z', ref, '--', dir]);
    return out ? out.split('\0').filter(Boolean) : [];
}

/**
 * Files the working tree changes against `ref`: tracked edits, additions, deletions and renames, plus untracked files.
 */
export function changedFiles(root: string, ref: string) {
    const tracked = git(root, ['diff', '--name-only', '-z', ref, '--']) ?? '';
    const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z']) ?? '';
    return new Set([...tracked.split('\0'), ...untracked.split('\0')].filter(Boolean));
}

/**
 * The base `--base` names (R-004): a merge request's diff base in CI, nothing in another CI pipeline, the merge base
 * with `origin/HEAD` (or `origin/main`) locally; an explicit ref is compared through its merge base with HEAD.
 *
 * @param given `auto`, a ref, or true when the flag had no value
 */
export function resolveBase(
    root: string,
    given: string | true,
    env: Record<string, string | undefined> = process.env,
): { ref: string | null; how: string } | { error: string } {
    if (given !== 'auto') {
        if (given === true || !given) return { error: '--base needs a ref, or auto' };
        if (!commitOf(root, given)) return { error: `base ref ${given} not found — git fetch origin` };
        return { ref: mergeBase(root, given), how: `merge base of ${given}` };
    }
    const sha = env.CI_MERGE_REQUEST_DIFF_BASE_SHA;
    if (sha) {
        if (!commitOf(root, sha)) return { error: `CI_MERGE_REQUEST_DIFF_BASE_SHA ${sha} is not in this clone` };
        return { ref: sha, how: 'the merge request diff base' };
    }
    if (env.CI) return { ref: null, how: 'none — a CI pipeline outside a merge request' };
    for (const upstream of ['origin/HEAD', 'origin/main']) {
        if (!commitOf(root, upstream)) continue;
        const ref = git(root, ['merge-base', upstream, 'HEAD'])?.trim();
        if (ref) return { ref, how: `merge base of ${upstream}` };
    }
    return { error: 'no origin/HEAD or origin/main to compare against — git fetch origin' };
}
