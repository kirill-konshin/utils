import type { SpawnSyncOptions } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { GRAPHIFY_VERSION, type GraphifyOptions } from './config.js';
import type { RunCommand } from './lintPrepare.js';

/**
 * graphify (https://graphify.com, PyPI `graphifyy`) for `lint-prepare`, by the `graphify` option of `lint.config.ts`:
 *
 * - left out (`detect`): a `graphify` on `PATH` gets its skills and a graph build
 * - `true` or options (`venv`): installed into the project `.venv` with `uv`, plus its AGENTS.md section and Claude
 *   Code hooks, which are committed: every clone gets the same `.venv`
 * - `false` (`off`): nothing, and what earlier runs installed is removed
 *
 * graphify writes its own files: its skills into `.agents/skills` (the generic flavor) and `.claude/skills` (the Claude
 * Code flavor), its section into AGENTS.md between the anchors lint-prepare generates, its hooks into
 * `.claude/settings.json`. lint-prepare only points the hooks at `.venv` and keeps the section on the next generation.
 */

export type GraphifyMode = 'off' | 'detect' | 'venv';

type Hook = { type?: string; command?: string };
type HookGroup = { matcher?: string; hooks?: Hook[] };
/** Claude Code hook groups by event (`PreToolUse`, ...), as `.claude/settings.json` holds them. */
type HookGroups = Record<string, HookGroup[]>;

/** What setUpGraphify() leaves for the rest of `lint-prepare`. */
export type GraphifySetup = {
    mode: GraphifyMode;
    /** The executable, when graphify can run. */
    exe?: string;
};

/** The skill name graphify installs. */
export const GRAPHIFY_SKILL = 'graphify';
// graphify replaces its section from this exact line up to the next `## ` line: the virtualenv heading ends it
const SECTION_HEADING = '## graphify';
const VENV_HEADING = '## graphify virtualenv';
const GITIGNORE_BEGIN = '# @kirill.konshin/lint: graphify';
const GITIGNORE_END = '# @kirill.konshin/lint: graphify end';
const VENV = '.venv';
// the hook command of a committed `.claude/settings.json`: `.venv` is not on `PATH`, and graphify writes the
// installing machine's absolute path
const VENV_HOOK_EXE = `"$CLAUDE_PROJECT_DIR"/${VENV}/bin/graphify`;
// a skill folder graphify installed holds its version stamp
const VERSION_STAMP = '.graphify_version';
// the skill registration graphify's Claude Code install adds to `.claude/CLAUDE.md`, up to the next `# ` line
const REGISTRATION_HEADING = '# graphify';
// install output is chatty (banners, a sign-up link): only errors are shown
const QUIET: SpawnSyncOptions = { stdio: ['ignore', 'ignore', 'inherit'] };

const isWindows = process.platform === 'win32';

/** The mode the `graphify` option asks for, and the version `venv` installs. */
export function graphifyMode(option: boolean | GraphifyOptions | undefined): { mode: GraphifyMode; version: string } {
    if (option === undefined) return { mode: 'detect', version: GRAPHIFY_VERSION };
    if (typeof option === 'boolean') return { mode: option ? 'venv' : 'off', version: GRAPHIFY_VERSION };

    return { mode: option.enabled === false ? 'off' : 'venv', version: option.version ?? GRAPHIFY_VERSION };
}

/** The absolute path of `command` on `PATH`, undefined when there is none. */
export function findOnPath(command: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
    const exts = isWindows ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];

    for (const dir of (env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
        for (const ext of exts) {
            const file = path.join(dir, command + ext);
            try {
                fs.accessSync(file, fs.constants.X_OK);
                if (fs.statSync(file).isFile()) return file;
            } catch {
                // not here
            }
        }
    }

    return undefined;
}

/** The graphify executable of the project `.venv`. */
export const venvExe = (cwd: string): string =>
    isWindows ? path.join(cwd, VENV, 'Scripts', 'graphify.exe') : path.join(cwd, VENV, 'bin', 'graphify');

/** A skill folder graphify installed: it holds graphify's version stamp. */
export const isGraphifySkill = (dir: string): boolean => fs.existsSync(path.join(dir, VERSION_STAMP));

function runQuiet(run: RunCommand, command: string, args: string[], cwd: string): boolean {
    const result = run(command, args, { cwd, ...QUIET });

    if (result.status === 0) return true;

    console.warn(
        `[lint-prepare] ${path.basename(command)} ${args.join(' ')} failed (${result.error?.message ?? `exit code ${result.status}`}), graphify may be incomplete: re-run lint-prepare`,
    );
    return false;
}

/**
 * Create the project `.venv` with `uv` (kept when it exists) and install `graphifyy==version` into it. Throws when `uv`
 * is missing: `graphify: true` asks for it.
 */
export function installGraphifyVenv(cwd: string, version: string, run: RunCommand): boolean {
    const uv = findOnPath('uv');

    if (!uv) {
        throw new Error(
            '[lint-prepare] graphify: true in lint.config.ts needs uv, install it: https://docs.astral.sh/uv/getting-started/installation/',
        );
    }

    return (
        runQuiet(run, uv, ['venv', '--allow-existing', VENV], cwd) &&
        runQuiet(run, uv, ['pip', 'install', '--python', VENV, `graphifyy==${version}`], cwd)
    );
}

/**
 * Let graphify install its skills where skills live: the generic flavor into `.agents/skills/graphify` (Codex and the
 * rest), the Claude Code flavor into `.claude/skills/graphify` (it also registers the skill in `.claude/CLAUDE.md`).
 */
export function installGraphifySkills(cwd: string, exe: string, run: RunCommand): boolean {
    return ['agents', 'claude'].every((platform) =>
        runQuiet(run, exe, ['install', '--project', '--platform', platform], cwd),
    );
}

/** Remove what graphify installed: its skill folders (only the ones with its stamp) and its skill registration. */
export function removeGraphifySkills(cwd: string): void {
    for (const dir of ['.agents', '.claude']) {
        const skill = path.join(cwd, dir, 'skills', GRAPHIFY_SKILL);
        if (isGraphifySkill(skill)) fs.rmSync(skill, { recursive: true, force: true });
    }

    const claudeMd = path.join(cwd, '.claude', 'CLAUDE.md');
    if (!fs.existsSync(claudeMd)) return;

    const content = fs.readFileSync(claudeMd, 'utf-8');
    const updated = removeSection(content, REGISTRATION_HEADING, '# ');

    if (updated === content) return;
    if (updated.trim()) fs.writeFileSync(claudeMd, updated);
    else fs.unlinkSync(claudeMd);
}

/** `content` without the section that starts at the exact line `heading` and ends before the next `boundary` line. */
export function removeSection(content: string, heading: string, boundary: string): string {
    const lines = content.split('\n');
    const start = lines.findIndex((line) => line.trim() === heading);

    if (start === -1) return content;

    const length = lines.slice(start + 1).findIndex((line) => line.startsWith(boundary));
    const rest = [...lines.slice(0, start), ...(length === -1 ? [] : lines.slice(start + 1 + length))];
    return `${rest
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()}\n`;
}

/**
 * The AGENTS.md anchors for `venv`: graphify's `## graphify` section, kept from `previous` (graphify fills it right
 * after, `graphify claude install`), then the `## graphify virtualenv` heading, which ends graphify's section, with how
 * to reach `.venv`.
 */
export function graphifyAgentsSection(previous = ''): string {
    const lines = previous.split('\n');
    const start = lines.indexOf(SECTION_HEADING);
    const end = start === -1 ? -1 : lines.indexOf(VENV_HEADING, start);
    const section = end === -1 ? SECTION_HEADING : lines.slice(start, end).join('\n').trim();

    return [
        section,
        '',
        VENV_HEADING,
        '',
        `graphify is installed in the project \`${VENV}\`, not on \`PATH\`: run every \`graphify\` and \`python3\` command of the graphify skill as \`source ${VENV}/bin/activate && <command>\`, from the repository root.`,
    ].join('\n');
}

const isGraphifyCommand = (command = ''): boolean =>
    command.includes('graphify') && /\bhook-(guard|check)\b/.test(command);

/** A graphify hook command, any executable path, run from `.venv`. */
export const toVenvCommand = (command: string): string =>
    command.replace(/^(?:"[^"]*"|\S+)(?=\s+hook-(?:guard|check)\b)/, VENV_HOOK_EXE);

/**
 * `settings` with graphify's hooks run from `.venv` (`venv`), or without them (an emptied group, event or `hooks`
 * goes too).
 */
export function updateGraphifyHooks(settings: Record<string, unknown>, venv: boolean): Record<string, unknown> {
    const hooks: HookGroups = {};

    for (const [event, groups] of Object.entries((settings.hooks ?? {}) as HookGroups)) {
        const kept = groups.flatMap((group) => {
            if (!group.hooks?.some((hook) => isGraphifyCommand(hook.command))) return [group];
            const own = venv
                ? group.hooks.map((hook) =>
                      isGraphifyCommand(hook.command) ? { ...hook, command: toVenvCommand(hook.command!) } : hook,
                  )
                : group.hooks.filter((hook) => !isGraphifyCommand(hook.command));
            return own.length ? [{ ...group, hooks: own }] : [];
        });
        if (kept.length) hooks[event] = kept;
    }

    const rest = { ...settings };
    delete rest.hooks;
    return Object.keys(hooks).length ? { ...rest, hooks } : rest;
}

/**
 * Run updateGraphifyHooks() over `.claude/settings.json`, writing it only when it changes; a file that does not parse
 * is left alone.
 */
export function updateClaudeSettings(cwd: string, venv: boolean): void {
    const file = path.join(cwd, '.claude', 'settings.json');

    if (!fs.existsSync(file)) return;

    let settings: Record<string, unknown>;
    try {
        settings = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
    } catch (error) {
        console.warn(`[lint-prepare] ${file} does not parse, graphify hooks not updated`, { error });
        return;
    }

    const updated = updateGraphifyHooks(settings, venv);
    if (JSON.stringify(updated) !== JSON.stringify(settings))
        fs.writeFileSync(file, `${JSON.stringify(updated, null, 2)}\n`);
}

/**
 * `graphify claude install`: its section into AGENTS.md (through the `CLAUDE.md` link, between the anchors) and its
 * hooks into `.claude/settings.json`, then the hooks pointed at `.venv`. Not `--project`: that installs the skill
 * again.
 */
export function installGraphifyInstructions(cwd: string, exe: string, run: RunCommand): void {
    if (runQuiet(run, exe, ['claude', 'install'], cwd)) updateClaudeSettings(cwd, true);
}

/**
 * The root `.gitignore` with lint-prepare's graphify block listing `entries`, or without it when there are none. The
 * block depends on `lint.config.ts` only, never on what a machine has, so every clone writes the same.
 */
export function updateGitignoreBlock(content: string, entries: string[]): string {
    const lines = content.split('\n');
    const from = lines.indexOf(GITIGNORE_BEGIN);
    const to = from === -1 ? -1 : lines.indexOf(GITIGNORE_END, from);
    const rest = to === -1 ? lines : [...lines.slice(0, from), ...lines.slice(to + 1)];
    const text = rest
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    const block = entries.length ? [GITIGNORE_BEGIN, ...entries, GITIGNORE_END].join('\n') : '';

    return [text, block].filter(Boolean).join('\n\n') + (text || block ? '\n' : '');
}

/** Write updateGitignoreBlock() into `cwd/.gitignore` when it changes. */
export function writeGitignoreBlock(cwd: string, mode: GraphifyMode): void {
    const file = path.join(cwd, '.gitignore');
    const entries = { off: [], detect: ['/graphify-out'], venv: ['/graphify-out', `/${VENV}`] }[mode];
    const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
    const updated = updateGitignoreBlock(content, entries);

    if (updated !== content) fs.writeFileSync(file, updated);
}

/**
 * Set graphify up for `mode` before the agent dirs are synced: the executable (`.venv` installed for `venv`, `PATH`
 * for `detect`) and its skills; `off` removes them. Nothing on CI. Throws when `venv` has no `uv`.
 */
export function setUpGraphify(
    cwd: string,
    option: boolean | GraphifyOptions | undefined,
    run: RunCommand,
): GraphifySetup {
    const { mode, version } = graphifyMode(option);
    const setup: GraphifySetup = { mode };

    if (process.env.CI) return setup;

    if (mode === 'off') {
        removeGraphifySkills(cwd);
        return setup;
    }

    if (mode === 'detect') {
        const exe = findOnPath('graphify');
        if (!exe) {
            console.log('graphify is not on PATH, skipped (graphify: false in lint.config.ts silences this)');
            return setup;
        }
        setup.exe = exe;
    } else {
        if (!installGraphifyVenv(cwd, version, run)) return setup;
        setup.exe = venvExe(cwd);
    }

    if (!installGraphifySkills(cwd, setup.exe, run)) return { mode };

    console.log(`Set up graphify (${mode === 'venv' ? `${VENV}, graphifyy ${version}` : setup.exe})`);
    return setup;
}

/**
 * After AGENTS.md is generated: `venv` gets graphify's section and hooks, the other modes lose the hooks. Then the code
 * graph in `graphify-out` is built or refreshed (`graphify update .`: code only, no LLM, no API key). Nothing on CI.
 */
export function finishGraphify(cwd: string, { mode, exe }: GraphifySetup, run: RunCommand): void {
    if (process.env.CI) return;

    if (mode !== 'venv') updateClaudeSettings(cwd, false);
    else if (exe) installGraphifyInstructions(cwd, exe, run);

    if (!exe) return;

    console.log('Building the graphify code graph (graphify update .)');
    const result = run(exe, ['update', '.'], { cwd, stdio: 'inherit' });

    if (result.status !== 0) {
        console.warn(
            `[lint-prepare] graphify update failed (${result.error?.message ?? `exit code ${result.status}`}): run "graphify update ." to retry`,
        );
    }
}
