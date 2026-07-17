#!/usr/bin/env node

/**
 * @kirill.konshin/eslint-config-next-custom
 *
 * Postinstall script: symlinks this package's SKILL.md (and README.md, which it
 * references via `@README.md`) into the consuming project's `.claude/skills/` (Claude
 * Code) and `.codex/skills/` (Codex CLI) directories, so both agents can discover and
 * run the install/update skill without any manual setup.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SKILL_NAME = 'eslint-config-next-custom';
const SOURCE_DIR = __dirname;
const SOURCE_FILES = ['SKILL.md', 'README.md'];
const TARGET_DIRS = ['.claude/skills', '.codex/skills'];

/**
 * Skip if the target skill directory contains anything that isn't a symlink - we don't
 * want to silently blow away a real file/directory a user placed there by hand. Emits an
 * error and returns false; as a postinstall side effect this must never fail the
 * consumer's install.
 */
function checkSkillDirSafety(skillDir) {
    if (!fs.existsSync(skillDir)) return true;

    for (const entry of fs.readdirSync(skillDir)) {
        const entryPath = path.join(skillDir, entry);

        if (!fs.lstatSync(entryPath).isSymbolicLink()) {
            console.error(`${skillDir}/${entry} exists and is not a symlink.`);
            console.error('Remove or back it up manually, then re-run install to get the skill.');
            return false;
        }
    }

    return true;
}

/**
 * Symlink SKILL.md and README.md into `<cwd>/<targetDir>/eslint-config-next-custom/`.
 * README.md is placed alongside SKILL.md (rather than left to resolve through the
 * symlink's real path) so the `@README.md` reference resolves regardless of how the
 * consuming tool interprets relative mentions. Returns null when the target was skipped.
 */
function symlinkSkill(cwd, targetDir) {
    const skillDir = path.join(cwd, targetDir, SKILL_NAME);

    if (!checkSkillDirSafety(skillDir)) return null;

    fs.rmSync(skillDir, { recursive: true, force: true });
    fs.mkdirSync(skillDir, { recursive: true });

    for (const file of SOURCE_FILES) {
        const source = path.join(SOURCE_DIR, file);
        const linkPath = path.join(skillDir, file);
        fs.symlinkSync(path.relative(skillDir, source), linkPath);
    }

    return skillDir;
}

function main() {
    const cwd = process.env.INIT_CWD || process.cwd();

    for (const targetDir of TARGET_DIRS) {
        try {
            const skillDir = symlinkSkill(cwd, targetDir);
            if (!skillDir) continue;
            console.log(
                `@kirill.konshin/eslint-config-next-custom: symlinked skill to ${path.relative(cwd, skillDir)}`,
            );
        } catch (e) {
            // e.g. EPERM on Windows without symlink privileges - the skill is a nice-to-have,
            // a failure to install it must never break the consumer's `npm install`
            console.error(
                `@kirill.konshin/eslint-config-next-custom: could not symlink skill to ${targetDir}:`,
                e.message,
            );
        }
    }
}

main();
