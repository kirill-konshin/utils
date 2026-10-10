import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The package's `skills/` at or above `dir`: the bundle sits inside it, the source beside it. */
function skillsDirOf(dir: string): string {
    if (path.basename(dir) === 'skills' && fs.existsSync(path.join(dir, 'spec-tools'))) return dir;
    if (fs.existsSync(path.join(dir, 'skills', 'spec-tools'))) return path.join(dir, 'skills');
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('spec-tools: no skills/ above the CLI');
    return skillsDirOf(parent);
}

/**
 * The skills the package ships. Found from the file itself, so the bundle runs from `skills/` alone — what a CI job
 * receives as an artifact, with no package.json beside it.
 */
export const SKILLS_DIR = skillsDirOf(path.dirname(fileURLToPath(import.meta.url)));
