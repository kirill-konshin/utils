import type { SpawnSyncOptions } from 'node:child_process';

/**
 * The part of `spawnSync` `lint-prepare` uses to run the tools it drives (the `skills` CLI, uv, graphify); tests pass a
 * stand-in.
 */
export type RunCommand = (
    command: string,
    args: string[],
    options: SpawnSyncOptions,
) => { status: number | null; error?: Error };

/** A command `lint-prepare` runs, named in its warning by `label`; `what` may be incomplete when it fails. */
type ToolRun = { command: string; args: string[]; options: SpawnSyncOptions; label: string; what: string };

/**
 * Run a tool `lint-prepare` drives. A failure is a warning, the install goes on. Returns whether the command succeeded.
 */
export function runOrWarn(run: RunCommand, { command, args, options, label, what }: ToolRun): boolean {
    const result = run(command, args, options);

    if (result.status === 0) return true;

    console.warn(
        `[lint-prepare] ${label} failed (${result.error?.message ?? `exit code ${result.status}`}), ${what} may be incomplete: re-run lint-prepare`,
    );
    return false;
}
