// @ts-check
/**
 * The guard's wiring into a repository — routing in AGENTS.md, the scoped rule, the edit hook, the OPSX operation
 * guidance — and the edit hook itself. Correctness never depends on the skill being discovered: the hook and the
 * scoped rule reach the agent whether or not it loads the skill.
 */
import fs from 'node:fs';
import path from 'node:path';

import { baseIndex, checkCorpus, diffCorpus } from './checks.mjs';
import { isTestFile, scanCitations } from './citations.mjs';
import { capabilityOf, DEFAULT_SPECS_DIR, parseSpec } from './corpus.mjs';
import { git, show, toplevel } from './git.mjs';

export const SCRIPT = 'node_modules/@kirill.konshin/lint/skills/spec-steward/scripts/steward.mjs';
export const HOOK_COMMAND = `f="$CLAUDE_PROJECT_DIR/${SCRIPT}"; [ ! -f "$f" ] || node "$f" hook`;
export const AGENTS_LINE =
    "Specifications: edits under `openspec/` are guarded by the scoped rule `.agents/rules/openspec.md` and the `spec-steward` edit hook; corpus-quality audits, review rounds and cross-repository alignment use the `spec-steward` skill, and code conformance is the repository's own audit.";
/** The OPSX guidance points at the repository's own spec gate; the gate runs spec-steward, so no second command. */
export const GATE_POINTER = 'AGENTS.md → Checks';
export const GUIDANCE = {
    apply: `Before handing back a spec change run the repository's spec gate (${GATE_POINTER}) and surface every \`weakened\` finding to the owner.`,
    archive: `Archive only after the repository's spec gate (${GATE_POINTER}) passes and every \`weakened\` finding has the owner's answer.`,
};
/** A guidance item from an earlier version that ran steward by path; `wire --fix` replaces it with the pointer. */
const LEGACY_GUIDANCE = /steward\.mjs check|spec-steward check/;
/**
 * Whether the operation's own section of `operations:` points at the gate.
 * @param {'apply' | 'archive'} op
 * @param {string} ops the config from its `operations:` key onwards
 */
const hasPointer = (op, ops) => {
    const re = new RegExp(`^ {2}${op}:[^\\n]*\\n((?:(?: {3,}|[ \\t]*#)[^\\n]*\\n?|[ \\t]*\\n)*)`, 'm');
    const section = re.exec(ops)?.[1];
    return !!section && /AGENTS\.md\s*(?:→|->)\s*Checks/.test(section);
};

/** @param {string} root */
const configPath = (root) =>
    ['openspec/config.yaml', 'openspec/config.yml'].map((p) => path.join(root, p)).find((p) => fs.existsSync(p));

/**
 * Which steering points are in place.
 * @param {{ path: string, specsDir?: string }} root
 */
export function wireStatus(root) {
    const has = (/** @type {string} */ p) => fs.existsSync(path.join(root.path, p));
    const read = (/** @type {string} */ p) => (has(p) ? fs.readFileSync(path.join(root.path, p), 'utf8') : '');
    const hook = (() => {
        try {
            const settings = JSON.parse(read('.claude/settings.json') || '{}');
            return (settings.hooks?.PostToolUse ?? []).some((/** @type {any} */ e) =>
                (e.hooks ?? []).some(
                    (/** @type {any} */ h) =>
                        typeof h.command === 'string' &&
                        h.command.includes('steward.mjs') &&
                        h.command.includes('hook'),
                ),
            );
        } catch {
            return false;
        }
    })();
    const cfg = configPath(root.path);
    const config = cfg ? fs.readFileSync(cfg, 'utf8') : '';
    const ops = config.slice(Math.max(0, config.search(/^operations:/m)));
    return {
        applicable: has(root.specsDir ?? DEFAULT_SPECS_DIR),
        agents: /spec-steward/.test(read('AGENTS.md')),
        rule: ['.agents', '.claude'].some((d) => has(`${d}/rules/openspec.md`)),
        skill: ['.agents', '.claude'].some((d) => has(`${d}/skills/spec-steward/SKILL.md`)),
        hook,
        opsx: config.search(/^operations:/m) >= 0 && hasPointer('apply', ops) && hasPointer('archive', ops),
    };
}

/** One line when the guard is not fully wired, else empty. @param {{ path: string, specsDir?: string }} root */
export function wireWarning(root) {
    const s = wireStatus(root);
    if (!s.applicable) return '';
    const missing = Object.entries(s)
        .filter(([k, v]) => k !== 'applicable' && !v)
        .map(([k]) => k);
    return missing.length
        ? `spec-steward: the guard is not fully wired (missing: ${missing.join(', ')}) — run \`steward wire --check\``
        : '';
}

/**
 * Add a line to a YAML list `operations.<op>.guidance`, creating the keys when absent, or replace the item an earlier
 * version wrote there. Text-level, so comments survive; handles OpenSpec's standard shape and refuses anything else.
 * @param {string} text
 * @param {'apply' | 'archive'} op
 * @param {string} line
 * @returns {string | null} the new text, or null when the shape is not recognised
 */
export function addGuidance(text, op, line) {
    const item = `'${line.replace(/'/g, "''")}'`;
    const lines = text.split('\n');
    let ops = lines.findIndex((l) => /^operations:\s*$/.test(l));
    if (ops < 0) {
        const out = text.replace(/\s*$/, '');
        return `${out}\n\noperations:\n  ${op}:\n    guidance:\n      - ${item}\n`;
    }
    const end = (/** @type {number} */ from, /** @type {number} */ indent) => {
        let i = from + 1;
        while (
            i < lines.length &&
            (!lines[i].trim() || /^\s*#/.test(lines[i]) || (/^(\s*)/.exec(lines[i])?.[1].length ?? 0) > indent)
        )
            i++;
        return i;
    };
    const opsEnd = end(ops, 0);
    let opLine = -1;
    for (let i = ops + 1; i < opsEnd; i++) if (new RegExp(`^\\s{2}${op}:\\s*$`).test(lines[i])) opLine = i;
    if (opLine < 0) {
        lines.splice(opsEnd, 0, `  ${op}:`, `    guidance:`, `      - ${item}`);
        return lines.join('\n');
    }
    const opEnd = end(opLine, 2);
    let g = -1;
    for (let i = opLine + 1; i < opEnd; i++) if (/^\s{4}guidance:\s*$/.test(lines[i])) g = i;
    if (g < 0) {
        lines.splice(opEnd, 0, `    guidance:`, `      - ${item}`);
        return lines.join('\n');
    }
    const gEnd = end(g, 4);
    for (let i = g + 1; i < gEnd; i++)
        if (/^\s{6}-\s/.test(lines[i]) && LEGACY_GUIDANCE.test(lines[i])) {
            lines[i] = `      - ${item}`;
            return lines.join('\n');
        }
    let last = g;
    for (let i = g + 1; i < gEnd; i++)
        if (/^\s{6}-\s/.test(lines[i]) || (/^\s{8,}\S/.test(lines[i]) && last > g)) last = i;
    if (!lines.slice(g + 1, gEnd).every((l) => !l.trim() || /^\s{6,}/.test(l) || /^\s*#/.test(l))) return null;
    lines.splice(last + 1, 0, `      - ${item}`);
    return lines.join('\n');
}

/**
 * @param {Record<string, any>} opts
 * @param {{ name: string, path: string, specsDir?: string }} root
 */
export function wireCli(opts, root) {
    if (opts.fix) {
        const settingsFile = path.join(root.path, '.claude/settings.json');
        const settings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, 'utf8')) : {};
        if (!wireStatus(root).hook) {
            settings.hooks ??= {};
            settings.hooks.PostToolUse ??= [];
            settings.hooks.PostToolUse.push({
                matcher: 'Edit|Write|MultiEdit',
                hooks: [{ type: 'command', command: HOOK_COMMAND, timeout: 30, statusMessage: 'spec-steward check' }],
            });
            fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
            fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 4) + '\n');
            process.stdout.write(`wired the edit hook into .claude/settings.json\n`);
        }
        const cfg = configPath(root.path);
        if (cfg && !wireStatus(root).opsx) {
            let text = fs.readFileSync(cfg, 'utf8');
            for (const op of /** @type {const} */ (['apply', 'archive'])) {
                const ops = text.slice(Math.max(0, text.search(/^operations:/m)));
                if (hasPointer(op, ops) && text.search(/^operations:/m) >= 0) continue;
                const next = addGuidance(text, op, GUIDANCE[op]);
                if (next === null) {
                    process.stdout.write(
                        `could not place the ${op} guidance in ${path.relative(root.path, cfg)} — add it by hand: ${GUIDANCE[op]}\n`,
                    );
                    continue;
                }
                text = next;
            }
            fs.writeFileSync(cfg, text);
            process.stdout.write(`wired the apply/archive guidance into ${path.relative(root.path, cfg)}\n`);
        }
        if (!wireStatus(root).agents)
            process.stdout.write(`add to AGENTS.md, beside the specification-driven convention:\n  ${AGENTS_LINE}\n`);
    }
    const s = wireStatus(root);
    const labels = {
        agents: 'AGENTS.md routes to spec-steward',
        rule: '.agents/rules/openspec.md (or .claude/rules) is linked by lint-prepare',
        skill: '.agents/skills/spec-steward (or .claude/skills) is linked by lint-prepare',
        hook: '.claude/settings.json runs the edit hook',
        opsx: `openspec/config apply/archive guidance points at the repository's spec gate (${GATE_POINTER})`,
    };
    if (!s.applicable) {
        process.stdout.write('no specifications here — nothing to wire\n');
        return 0;
    }
    for (const [k, label] of Object.entries(labels))
        process.stdout.write(`${s[/** @type {keyof typeof s} */ (k)] ? '✓' : '✗'} ${label}\n`);
    return Object.entries(s).every(([, v]) => v) ? 0 : 1;
}

/** Keys of findings already reported, per worktree, so an agent is told once per content. @param {string} root */
function memory(root) {
    const dir = git(root, ['rev-parse', '--git-dir'])?.trim();
    const file = dir ? path.resolve(root, dir, 'spec-steward-hook.json') : null;
    /** @type {string[]} */
    let seen = [];
    try {
        if (file && fs.existsSync(file)) seen = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        seen = [];
    }
    return {
        has: (/** @type {string} */ k) => seen.includes(k),
        save: (/** @type {string[]} */ keys) => {
            if (!file || !keys.length) return;
            try {
                fs.writeFileSync(file, JSON.stringify([...seen, ...keys].slice(-500)));
            } catch {
                // memory is a courtesy, never a failure
            }
        },
    };
}

/**
 * Findings for one edited file: on a spec, what the edit changed against HEAD; on a test or source file, its
 * citations. Never the backlog of findings an untouched requirement already had.
 * @param {string} root
 * @param {string} rel
 * @param {string} specsDir
 */
export function hookFindings(root, rel, specsDir = DEFAULT_SPECS_DIR) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return [];
    const text = fs.readFileSync(abs, 'utf8');
    if (rel.startsWith(`${specsDir}/`) && rel.endsWith('/spec.md')) {
        const cap = capabilityOf(specsDir, rel);
        const head = { name: '', path: root, specsDir, capabilities: [parseSpec(text, rel, cap)] };
        const before = show(root, 'HEAD', rel);
        const base = {
            name: '',
            path: root,
            specsDir,
            capabilities: before === null ? [] : [parseSpec(before, rel, cap)],
        };
        const { findings } = diffCorpus(base, head);
        const old = new Map(base.capabilities.flatMap((c) => c.requirements).map((r) => [r.id, r.block]));
        const changed = new Set(
            head.capabilities[0].requirements.filter((r) => old.get(r.id) !== r.block).map((r) => r.id),
        );
        // The base enables the prompts that judge new text; the ratchet it would also enable is the gate's, not ours.
        const local = checkCorpus(head, [], { files: new Set([rel]), base: baseIndex(base) }).filter(
            (f) =>
                f.kind === 'duplicate-anchor' ||
                (f.id &&
                    changed.has(f.id) &&
                    [
                        'impl-detail',
                        'vague-obligation',
                        'restating-scenario',
                        'duplicate-scenario',
                        'non-ears',
                        'non-bdd',
                        'marker-hygiene',
                        'size',
                    ].includes(f.kind)),
        );
        return [...findings, ...local];
    }
    if (!text.includes('openspec/')) return [];
    const anchorsOf = (/** @type {string} */ t) => parseSpec(t, '', '').slugs;
    const citations = scanCitations(root, anchorsOf, { files: [rel] });
    if (!citations.length) return [];
    const corpusFiles = [...new Set(citations.filter((c) => c.resolves).map((c) => c.target))];
    const corpus = {
        name: '',
        path: root,
        specsDir,
        capabilities: corpusFiles.map((f) =>
            parseSpec(fs.readFileSync(path.join(root, f), 'utf8'), f, capabilityOf(specsDir, f)),
        ),
    };
    return checkCorpus(corpus, citations, { files: new Set([rel]) }).filter((f) =>
        isTestFile(rel)
            ? ['dangling-citation', 'textual-test', 'unbound-test'].includes(f.kind)
            : f.kind === 'dangling-citation',
    );
}

/**
 * Claude Code PostToolUse entry: reads the hook JSON on stdin, prints a `decision: block` with the findings so they are
 * fed back to the agent at once, or nothing.
 * @param {Record<string, any>} opts
 */
export async function hookCli(opts) {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    let event;
    try {
        event = JSON.parse(input || '{}');
    } catch {
        return 0;
    }
    const file = event?.tool_input?.file_path ?? event?.tool_response?.filePath;
    if (!file || typeof file !== 'string') return 0;
    const resolved = path.resolve(event.cwd ?? process.cwd(), file);
    if (!fs.existsSync(resolved)) return 0;
    const absFile = fs.realpathSync(resolved);
    const top = toplevel(path.dirname(absFile));
    if (!top) return 0;
    const root = fs.realpathSync(top);
    const specsDir = opts.specs ?? DEFAULT_SPECS_DIR;
    if (!fs.existsSync(path.join(root, specsDir))) return 0;
    const rel = path.relative(root, absFile).split(path.sep).join('/');
    const findings = hookFindings(root, rel, specsDir);
    const mem = memory(root);
    const fresh = findings.filter((f) => !mem.has(`${f.file}|${f.kind}|${f.id ?? f.line}|${f.message}`));
    if (!fresh.length) return 0;
    mem.save(fresh.map((f) => `${f.file}|${f.kind}|${f.id ?? f.line}|${f.message}`));
    const reason = [
        `spec-steward found ${fresh.length} thing(s) in your edit of ${rel}:`,
        ...fresh.map((f) => `- ${f.file}:${f.line} ${f.kind}: ${f.message}`),
        'Act on them per the Check table of the spec-steward skill: `weakened` means stop and ask the owner; `new-requirement` means name the failure it prevents and its cheapest evidence in your reply; an error (`size`, `duplicate-anchor`) fails the spec gate until fixed; the rest are prompts for judgement — never write a test just to silence one.',
    ].join('\n');
    process.stdout.write(
        JSON.stringify({
            decision: 'block',
            reason,
            hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: reason },
        }) + '\n',
    );
    return 0;
}
