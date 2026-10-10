import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { EVIDENCE_FILE } from './files';

/** spec-steward's CLI in this package — beside the source and beside the build alike, two levels below the package. */
const STEWARD = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../skills/spec-steward/scripts/steward.mjs',
);

/** spec-steward with its output on this terminal; its exit code. Binds come from the repository's own configuration. */
export const steward = (args: readonly string[], cwd: string): number =>
    spawnSync(process.execPath, [STEWARD, ...args], { cwd, stdio: 'inherit' }).status ?? 1;

/** spec-steward's evidence model, written to the repository root for the scope and the focused check to read. */
export function writeEvidence(cwd: string): void {
    const run = spawnSync(process.execPath, [STEWARD, 'evidence', '--json'], {
        cwd,
        encoding: 'utf8',
        maxBuffer: 512 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'inherit'],
    });
    if (run.status !== 0) throw new Error(`spec-steward evidence exited ${run.status}`);
    fs.writeFileSync(path.join(cwd, EVIDENCE_FILE), run.stdout);
}
