import { execFileSync } from 'node:child_process';

let top: string | undefined;

/**
 * The repository the tools run in: the working tree the current directory belongs to, a detached audit tree included.
 * Resolved on first use, so importing a module never needs a repository.
 */
export const root = (): string =>
    (top ??= execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());

/** A git command in a repository, the current one by default; its stdout. */
export const git = (args: readonly string[], cwd: string = root()): string =>
    execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
