/**
 * spec-steward's corpus-quality audit on the shared engine: the same evidence, partition, workers, completion and
 * verification passes as spec-verify, with spec-steward's worker contract (`skills/spec-steward/references/worker.md`),
 * its sweeps (`skills/spec-steward/sweeps.json`) as units beside the capability parts, a skeptic verifier for every
 * finding, and a mechanical merge into the review file `spec-tools steward review render` writes — the owner's to answer.
 * What `workflows/audit.js` once did with model passes is mechanical here: a quote not at its line drops the finding,
 * the judged lists stand for the critic, and findings sharing a theme key are offered as a theme for the operator to
 * sharpen.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { jsonrepair } from 'jsonrepair';

import type { EvidenceModel } from './auditParts';
import type { ShortPart } from './auditReport';
import type { Part, ScopeJson } from './auditScope';
import { AUDIT_FILES, findingsFile } from './files';
import { git, root } from './repo';
import { SKILLS_DIR } from './skillsDir';
import { render as renderReview } from './steward/lib/review';
import { globToRegExp } from './steward/lib/util';

const FILES = AUDIT_FILES['spec-steward'];

/** One sweep as the skill declares it: an angle, the criteria it looks for, and where it reads. */
type Sweep = {
    readonly key: string;
    readonly title: string;
    readonly focus: string;
    readonly files?: readonly string[];
    /** Read where the evidence model's tests (`bindings`) or citations (`pointers`) are. */
    readonly from?: 'bindings' | 'pointers';
};

/** A finding as a spec-steward worker writes it (`references/worker.md`). */
export type StewardFinding = {
    readonly file: string;
    readonly line: number;
    readonly quote: string;
    readonly ruleName?: string;
    readonly criteria?: readonly number[];
    readonly layer: string;
    readonly whatsWrong: string;
    readonly proposed: string;
    readonly evidence?: readonly string[];
    readonly crossRefs?: readonly string[];
    readonly themeKey?: string;
    readonly needsHumanIntent?: boolean;
    readonly reversesPastDecision?: string;
    readonly confidence?: string;
};

/** A finding the merge carries: where it came from, and the review file's fields. */
export type Candidate = StewardFinding & { readonly part: number; readonly repo: string; readonly area: string };

type FindingsFile = {
    findings?: StewardFinding[];
    sound?: string[];
    judged?: string[];
    notes?: string[];
};

type Verdict = { verdict: 'keep' | 'revise' | 'drop'; reason: string; revised?: Partial<StewardFinding> };

export type Theme = {
    readonly key: string;
    readonly title: string;
    readonly whatsWrong: string;
    readonly proposed: string;
    readonly layer: string;
    readonly criteria: readonly number[];
    readonly needsHumanIntent: boolean;
    readonly members: readonly Candidate[];
};

/** What the merge writes: the review file's data, and what the completion and verification passes read. */
export type StewardData = {
    readonly summary: string;
    readonly candidates: readonly Candidate[];
    readonly themes: readonly Theme[];
    readonly findings: readonly Candidate[];
    readonly sound: readonly string[];
    readonly dropped: readonly (Candidate & { readonly droppedBy: string; readonly reason: string })[];
    readonly short: readonly ShortPart[];
    readonly notes: readonly string[];
};

/** The skill's sweeps, each a unit numbered after the last capability part, its files resolved in this repository. */
export function sweepUnits(model: EvidenceModel, after: number, cwd: string = root()): Part[] {
    const sweeps = JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, 'spec-steward/sweeps.json'), 'utf8')) as Sweep[];
    const tracked = git(['ls-files', '-co', '--exclude-standard'], cwd).split('\n').filter(Boolean);
    const fromEvidence = (kind: 'bindings' | 'pointers') => [
        ...new Set(model.requirements.flatMap((r) => r[kind].map((b) => b.file))),
    ];
    return sweeps.map((sweep, i) => {
        const patterns = (sweep.files ?? []).map(
            (glob) => new RegExp(`^${globToRegExp(glob).source.replace(/^\^/, '')}`),
        );
        const files = sweep.from
            ? fromEvidence(sweep.from)
            : tracked.filter((file) => patterns.some((re) => re.test(file)));
        const part = after + i + 1;
        return {
            part,
            capabilities: [],
            files: files.sort(),
            findings: [findingsFile(part, 1, 'spec-steward')],
            requirementIds: [],
            bytes: 0,
            requirements: 0,
            sweep: { key: sweep.key, title: sweep.title, focus: sweep.focus },
        };
    });
}

const LOAD_SKILL = (repo: string) =>
    `First, load the skill: use the Skill tool with skill "spec-steward" (or Read ${path.relative(repo, path.join(SKILLS_DIR, 'spec-steward/SKILL.md'))} if that fails), then Read its references/worker.md, references/model.md and references/criteria.md, and the placement guide ${path.relative(repo, path.join(SKILLS_DIR, '../rules/agent.md'))}, in full. worker.md is your contract: follow it exactly.`;
const TOOL_RULE =
    'Tool rule: only Skill, Read, Glob, Grep, Write and the read-only git commands — no ls/cat/find, no shell validation of your JSON; other commands are denied here and only cost a turn.';

const unitLine = (p: Part) =>
    p.sweep
        ? `- sweep: ${p.sweep.title} — ${p.sweep.focus}\n- files to read (Grep within a large one): ${p.files.join(', ') || '(none found — say so in notes)'}`
        : `- capabilities: ${p.capabilities.join(', ')}\n- evidence files to read in full, then the specifications they name: ${p.files.join(', ')}\n- requirementIds (judged must cover exactly these):\n${p.requirementIds.join('\n')}`;

/** The reading brief: one unit, judged against every criterion. */
export const brief = (
    p: Part,
    repo: string,
): string => `You are a worker for spec-steward's corpus-quality audit in repo ${repo}.

${LOAD_SKILL(repo)}

Your assignment:
- part: ${p.part}
- reader: 1
- findings file to write (Write tool, overwrite, nothing else): ${p.findings[0]}
${unitLine(p)}

${TOOL_RULE} Write the findings file exactly at the path above, then return one line: the path and your count of findings.
`;

/** The completion brief: what the first pass left — requirements no judged list names, or a unit that wrote nothing. */
export const briefComplete = (p: Part, short: ShortPart, reader: number, file: string, repo: string): string => {
    const ids = short.requirementIds.length ? short.requirementIds.join('\n') : '(the whole unit)';
    return `You are a completion worker for spec-steward's corpus-quality audit in repo ${repo}. The first pass over part ${p.part} was left short; judge exactly what it left, and nothing else.

${LOAD_SKILL(repo)}

Your assignment:
- part: ${p.part}
- reader: ${reader}
- findings file to write (Write tool, overwrite, nothing else): ${file}
${unitLine(p)}
- left unjudged — judge each against every criterion:
${ids}

Your judged list names exactly what you judged here. ${TOOL_RULE} Write the findings file exactly at the path above, then return one line: the path and your count of findings.
`;
};

/** The verifier's brief: one finding, the skeptic's questions, the verdict file. */
export const briefVerify = (f: Candidate, file: string, repo: string): string => {
    const { quote, ruleName, criteria, layer, whatsWrong, proposed, evidence, themeKey, needsHumanIntent } = f;
    const finding = {
        file: f.file,
        line: f.line,
        quote,
        ruleName,
        criteria,
        layer,
        whatsWrong,
        proposed,
        evidence,
        themeKey,
        needsHumanIntent,
    };
    return `You are the skeptic verifying ONE finding of spec-steward's corpus-quality audit in repo ${repo}. Its quote was found at its line mechanically. Judge it by spec-steward's references/model.md and references/criteria.md and the placement guide ${path.relative(repo, path.join(SKILLS_DIR, '../rules/agent.md'))}, reading with Read and Grep only.

The finding:
${JSON.stringify(finding, null, 2)}

- It silently decides an intent that is genuinely ambiguous → revise: needsHumanIntent true, the options in proposed.
- It is a style preference, an ordinary implementation bug, or speculation → drop.
- Its proposed verification would catch no real failure (compliance theatre) → revise or drop.
- It moves an internal contract out of the specification only because it is not user-facing → revise.
- Its target layer contradicts the placement guide → revise.
- It reverses a past owner decision without saying so → revise reversesPastDecision.
- A claim about code, tests, tooling or CI is false → revise it, or drop when the finding rests on it.
Default to keep when the finding is concrete, grounded and its proposal sound; sharpen wording where it helps the owner decide.

Write exactly this JSON with the Write tool to ${file} and nothing else:
{"verdict": "keep" | "revise" | "drop", "reason": "<one sentence>", "revised": {<only the fields you change>}}
Then return one line: the path and the verdict.
`;
};

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Whether a quote is in the block that starts at its line: each piece between `…` elisions, in order. */
export function quoteAt(quote: string, lines: readonly string[] | undefined, line: number): boolean {
    if (!lines || line < 1) return false;
    const block = normalize(lines.slice(line - 1, line + 39).join(' '));
    let from = 0;
    for (const piece of quote.split('…').map(normalize).filter(Boolean)) {
        const at = block.indexOf(piece, from);
        if (at < 0) return false;
        from = at + piece.length;
    }
    return from > 0;
}

/** The capability a specification file belongs to, else the unit that found it. */
const areaOf = (file: string, unit: Part | undefined) =>
    /^openspec\/specs\/(.+)\/spec\.md$/.exec(file)?.[1] ?? unit?.sweep?.key ?? `part-${unit?.part ?? '?'}`;

const readJson = <T>(file: string): T | undefined => {
    try {
        return JSON.parse(jsonrepair(fs.readFileSync(file, 'utf8'))) as T;
    } catch {
        return undefined;
    }
};

const words = (key: string) => key.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * The merge: every reader's findings, their quotes re-proved at their lines, the verifiers' verdicts applied, duplicates
 * folded, theme candidates grouped, coverage checked against the judged lists. Writes the data and renders the review
 * file; returns the one-line summary.
 */
export function merge(read: (file: string) => readonly string[] | undefined, cwd: string = root()): string {
    const scope = readJson<ScopeJson>(path.join(cwd, FILES.scope));
    if (!scope) throw new Error(`${FILES.scope} is missing — run spec-tools scope --audit spec-steward first`);
    const repo = path.basename(cwd);
    const dir = path.join(cwd, FILES.findings);
    const present = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    const candidates: Candidate[] = [];
    const sound = new Set<string>();
    const notes: string[] = [];
    const short: ShortPart[] = [];
    const dropped: (Candidate & { droppedBy: string; reason: string })[] = [];
    for (const unit of scope.parts) {
        const files = present.filter((f) => new RegExp(`^part-${unit.part}-\\d+\\.json$`).test(f)).sort();
        const judged = new Set<string>();
        for (const name of files) {
            const data = readJson<FindingsFile>(path.join(dir, name));
            if (!data) {
                notes.push(
                    `\`${FILES.findings}/${name}\` is not valid JSON — its part is judged again by the completion pass.`,
                );
                continue;
            }
            for (const id of data.judged ?? []) judged.add(id);
            for (const id of data.sound ?? []) sound.add(id);
            for (const n of data.notes ?? []) notes.push(`part ${unit.part}: ${n}`);
            for (const f of data.findings ?? []) {
                const candidate: Candidate = { ...f, part: unit.part, repo, area: areaOf(f.file, unit) };
                if (quoteAt(f.quote, read(f.file), f.line)) candidates.push(candidate);
                else
                    dropped.push({
                        ...candidate,
                        droppedBy: 'facts',
                        reason: `the quote is not at ${f.file}:${f.line}`,
                    });
            }
        }
        const missing = unit.requirementIds.filter((id) => !judged.has(id));
        if (!files.length) short.push({ part: unit.part, requirementIds: [], checks: {} });
        else if (missing.length) short.push({ part: unit.part, requirementIds: missing, checks: {} });
    }
    // The verifiers answer by position in the candidate list the previous merge wrote, which this one reproduces.
    const kept: Candidate[] = [];
    candidates.forEach((c, i) => {
        const verdict = readJson<Verdict>(path.join(dir, `verdict-${i + 1}.json`));
        if (verdict?.verdict === 'drop') dropped.push({ ...c, droppedBy: 'verifier', reason: verdict.reason });
        else
            kept.push(
                verdict?.verdict === 'revise' ? { ...c, ...verdict.revised, part: c.part, repo, area: c.area } : c,
            );
    });
    const unique = new Map<string, Candidate>();
    for (const c of kept) {
        const key = `${c.file}:${c.line}:${c.themeKey ?? ''}`;
        const seen = unique.get(key);
        if (!seen) unique.set(key, c);
        else
            unique.set(key, {
                ...seen,
                criteria: [...new Set([...(seen.criteria ?? []), ...(c.criteria ?? [])])],
                evidence: [...new Set([...(seen.evidence ?? []), ...(c.evidence ?? [])])],
            });
    }
    const byTheme = new Map<string, Candidate[]>();
    for (const c of unique.values()) if (c.themeKey) byTheme.set(c.themeKey, [...(byTheme.get(c.themeKey) ?? []), c]);
    const themes: Theme[] = [...byTheme.entries()]
        .filter(([, members]) => members.length >= 3)
        .map(([key, members]) => {
            const layers = members.map((m) => m.layer);
            const layer = layers.sort(
                (a, b) => layers.filter((l) => l === b).length - layers.filter((l) => l === a).length,
            )[0]!;
            return {
                key,
                title: words(key),
                whatsWrong: members[0]!.whatsWrong,
                proposed: members[0]!.proposed,
                layer,
                criteria: [...new Set(members.flatMap((m) => m.criteria ?? []))].sort((a, b) => a - b),
                needsHumanIntent: members.some((m) => m.needsHumanIntent),
                members,
            };
        });
    const themed = new Set(themes.flatMap((t) => t.members));
    const findings = [...unique.values()].filter((c) => !themed.has(c));
    const items = findings.length + themes.length;
    const summary = `REVIEW ${items} item(s) (${themes.length} theme(s)), ${dropped.length} dropped${short.length ? `, ${short.length} part(s) short` : ''}`;
    const data: StewardData = {
        summary,
        candidates,
        themes,
        findings,
        sound: [...sound].sort(),
        dropped,
        short,
        notes,
    };
    fs.mkdirSync(path.dirname(path.join(cwd, FILES.data)), { recursive: true });
    fs.writeFileSync(path.join(cwd, FILES.data), JSON.stringify(data, null, 2) + '\n');
    fs.writeFileSync(path.join(cwd, FILES.report), renderReview(data).markdown.trimEnd() + '\n');
    return `${summary} → ${FILES.report}`;
}
