/**
 * The review file: rendered from audit findings as YAML, answered by the owner item by item in place, processed round
 * by round. One top-level block per item, keyed by its id: a single rule carries `rule`, a theme carries `rules`. The
 * owner writes `decision`; whoever applies an item adds `applied`. Format: references/review-format.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';

import { toYaml } from '../../data';
import { normalize, parseArgs } from './util';

export type Finding = {
    repo: string;
    file: string;
    line: number;
    quote: string;
    ruleName?: string;
    criteria?: readonly number[];
    layer: string;
    whatsWrong: string;
    proposed: string;
    evidence?: readonly string[];
    crossRefs?: readonly string[];
    needsHumanIntent?: boolean;
    reversesPastDecision?: string;
    area?: string;
    note?: string;
    cid?: string;
    readerConfidence?: number;
    judgeConfidence?: number;
};
export type Theme = {
    key?: string;
    title: string;
    whatsWrong: string;
    proposed: string;
    layer: string;
    criteria?: readonly number[];
    needsHumanIntent?: boolean;
    members: readonly Finding[];
};

/** A rule an item quotes, and where; on a theme member, the owner's own `decision` for that member. */
export type RuleRef = { text: string; location: string; note?: string; decision?: string };

/** One item of the review file, as the owner sees and edits it. */
export type ReviewEntry = {
    title?: string;
    theme?: string;
    area?: string;
    layer?: string;
    criteria?: readonly number[];
    confidence?: number;
    needsHumanIntent?: boolean;
    rule?: RuleRef;
    rules?: readonly RuleRef[];
    wrong?: string;
    proposal?: string;
    evidence?: readonly string[];
    crossRefs?: readonly string[];
    reversesPastDecision?: string;
    decision?: string;
    previousDecision?: string | readonly string[];
    applied?: string | readonly string[];
};

export type Item = {
    id: string;
    theme: boolean;
    entry: ReviewEntry;
    state: string;
    applied: string[];
};

/** An item with this confidence or less is listed under "Low confidence". */
export const LOW_CONFIDENCE = 70;

const RESPONSE_STATES = ['open', 'accepted', 'accepted-with-comment', 'comment', 'rejected', 'rejected-with-comment'];

const location = (f: Finding) => `${f.repo} ${f.file}:${f.line}`;
const confidenceOf = (f: Finding) => f.judgeConfidence ?? f.readerConfidence;
const optional = <T>(key: string, value: T | undefined) =>
    value === undefined || (Array.isArray(value) && !value.length) ? {} : { [key]: value };

/** One finding as a review entry. */
export function findingEntry(f: Finding): ReviewEntry {
    return {
        title: f.ruleName ?? normalize(f.whatsWrong).split(/(?<=[.!?])\s/)[0],
        ...optional('area', f.area),
        layer: f.layer,
        ...optional('criteria', f.criteria),
        ...optional('confidence', confidenceOf(f)),
        ...(f.needsHumanIntent ? { needsHumanIntent: true } : {}),
        rule: { text: f.quote, location: location(f) },
        wrong: f.whatsWrong,
        proposal: f.proposed,
        ...optional('evidence', f.evidence?.slice(0, 6)),
        ...optional('crossRefs', f.crossRefs?.slice(0, 6)),
        ...optional('reversesPastDecision', f.reversesPastDecision),
        decision: '',
    };
}

/** A theme as a review entry: its rules as a list; its confidence the lowest of its members'. */
export function themeEntry(t: Theme, area?: string): ReviewEntry {
    const confidences = t.members.map(confidenceOf).filter((c): c is number => c !== undefined);
    return {
        theme: t.title,
        ...optional('area', area),
        layer: t.layer,
        ...optional('criteria', t.criteria),
        ...optional('confidence', confidences.length ? Math.min(...confidences) : undefined),
        ...(t.needsHumanIntent ? { needsHumanIntent: true } : {}),
        rules: t.members.map((m) => ({ text: m.quote, location: location(m), ...optional('note', m.note) })),
        wrong: t.whatsWrong,
        proposal: t.proposed,
        decision: '',
    };
}

/** A section of the review: the areas it gathers, in the order the review lists them. */
export type Section = { key: string; title: string; areas?: (string | undefined)[]; intro?: string };

/**
 * Render audit output into review entries, numbered from `start`: per area, themes then findings; every entry at or
 * below `LOW_CONFIDENCE` after the rest, under a comment saying so.
 */
export function render(
    data: { themes?: readonly Theme[]; findings?: readonly Finding[] },
    { start = 1, sections }: { start?: number; sections?: Section[] } = {},
) {
    let n = start;
    const next = () => `R-${String(n++).padStart(3, '0')}`;
    const themes = data.themes ?? [];
    const findings = data.findings ?? [];
    const areaOfTheme = (t: Theme) => {
        const counts = new Map<string | undefined, number>();
        for (const m of t.members) counts.set(m.area, (counts.get(m.area) ?? 0) + 1);
        return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    };
    const layout: Section[] =
        sections ??
        [...new Set([...themes.map(areaOfTheme), ...findings.map((f) => f.area)])].map((a) => ({
            key: a ?? 'other',
            title: a ?? 'Other',
            areas: [a],
        }));
    const ordered: ReviewEntry[] = [];
    for (const s of layout) {
        const areas = new Set(s.areas ?? [s.key]);
        for (const t of themes.filter((t) => areas.has(areaOfTheme(t)))) ordered.push(themeEntry(t, areaOfTheme(t)));
        for (const f of findings
            .filter((f) => areas.has(f.area))
            .sort((a, b) => a.repo.localeCompare(b.repo) || a.file.localeCompare(b.file) || a.line - b.line))
            ordered.push(findingEntry(f));
    }
    const low = (e: ReviewEntry) => e.confidence !== undefined && e.confidence <= LOW_CONFIDENCE;
    const sure = Object.fromEntries(ordered.filter((e) => !low(e)).map((e) => [next(), e]));
    const unsure = Object.fromEntries(ordered.filter(low).map((e) => [next(), e]));
    const parts = [Object.keys(sure).length ? toYaml(sure) : ''];
    if (Object.keys(unsure).length) parts.push(`# Low confidence — ${LOW_CONFIDENCE}% or lower\n${toYaml(unsure)}`);
    return { yaml: parts.filter(Boolean).join('\n'), next: n };
}

export function stateOf(decision: string) {
    const r = decision.trim();
    if (!r || r === '⬜') return 'open';
    if (r.startsWith('✅')) return r.replace('✅', '').trim() ? 'accepted-with-comment' : 'accepted';
    if (r.startsWith('❌')) return r.replace('❌', '').trim() ? 'rejected-with-comment' : 'rejected';
    if (r.startsWith('⬜')) return r.replace('⬜', '').trim() ? 'comment' : 'open';
    return 'comment';
}

/** The review file's text as items, or the YAML errors that stop it from being read. */
export function readReview(text: string): { items: Item[]; errors: string[] } {
    const doc = parseDocument(text, { uniqueKeys: true });
    if (doc.errors.length)
        return {
            items: [],
            errors: doc.errors.map(
                (e) => `line ${e.linePos?.[0]?.line ?? '?'}: not valid YAML: ${e.message.split('\n')[0]}`,
            ),
        };
    const data = (doc.toJS() ?? {}) as Record<string, ReviewEntry>;
    const items = Object.entries(data).map(([id, entry]) => {
        const applied = entry?.applied === undefined ? [] : [entry.applied].flat().map(String);
        return {
            id,
            theme: entry?.theme !== undefined || Array.isArray(entry?.rules),
            entry: entry ?? {},
            state: stateOf(String(entry?.decision ?? '')),
            applied,
        };
    });
    return { items, errors: [] };
}

/** Parse a review file into items; a file that is not valid YAML throws. */
export function parseReview(text: string): Item[] {
    const { items, errors } = readReview(text);
    if (errors.length) throw new Error(errors[0]);
    return items;
}

/** Locations a review names: `NAME path:line`. */
const parseLocation = (loc: string) => {
    const m = /^`?([\w-]+)\s+([^`\s]+):(\d+)`?$/.exec(loc.trim());
    return m ? { repo: m[1]!, file: m[2]!, line: Number(m[3]) } : null;
};

const rulesOf = (it: Item): RuleRef[] =>
    it.theme ? [...(it.entry.rules ?? [])] : it.entry.rule ? [it.entry.rule] : [];

/**
 * Every quote must be found, fragment by fragment in order, at its location (a window from the line on).
 *
 * @param roots NAME → absolute path
 */
export function verify(items: Item[], roots: Map<string, string>) {
    const problems: string[] = [];
    const cache = new Map<string, string[] | null>();
    const check = (id: string, quote: string, loc: string) => {
        const at = parseLocation(loc);
        if (!at) return problems.push(`${id}: location not understood: ${loc}`);
        const root = roots.get(at.repo);
        if (!root) return problems.push(`${id}: unknown repository ${at.repo} (pass --root ${at.repo}=<path>)`);
        const abs = path.join(root, at.file);
        if (!cache.has(abs)) cache.set(abs, fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8').split('\n') : null);
        const lines = cache.get(abs);
        if (!lines) return problems.push(`${id}: ${at.repo} ${at.file} does not exist`);
        if (at.line < 1 || at.line > lines.length)
            return problems.push(`${id}: ${at.repo} ${at.file}:${at.line} is past the end (${lines.length} lines)`);
        const window = normalize(lines.slice(at.line - 1, at.line + 59).join(' ')).replace(/[“”]/g, '"');
        const q = quote.replace(/[“”]/g, '"');
        let from = 0;
        for (const frag of q
            .split(/…|\.\.\./)
            .map((x) => normalize(x))
            .filter((x) => x.length > 2)) {
            const idx = window.indexOf(frag, from);
            if (idx < 0)
                return problems.push(
                    `${id}: quote not found at ${at.repo} ${at.file}:${at.line}: "${frag.slice(0, 80)}"`,
                );
            from = idx + frag.length;
        }
    };
    for (const it of items) for (const r of rulesOf(it)) check(it.id, String(r.text ?? ''), String(r.location ?? ''));
    return problems;
}

/** Everything wrong with the review file's shape: YAML errors, ids, required fields, locations. */
export function lint(text: string) {
    const { items, errors } = readReview(text);
    if (errors.length) return { items, problems: errors };
    const problems: string[] = [];
    for (const it of items) {
        const e = it.entry;
        if (!/^R-\d+$/.test(it.id)) problems.push(`${it.id}: the id is not R-<number>`);
        if (it.theme && !(e.rules ?? []).length) problems.push(`${it.id}: a theme lists no rules`);
        if (!it.theme && !e.rule) problems.push(`${it.id}: missing "rule"`);
        for (const field of ['wrong', 'proposal'] as const)
            if (!e[field]) problems.push(`${it.id}: missing "${field}"`);
        if (!('decision' in e)) problems.push(`${it.id}: missing "decision"`);
        for (const r of rulesOf(it)) {
            if (!String(r.text ?? '').trim()) problems.push(`${it.id}: a rule has no text`);
            if (!parseLocation(String(r.location ?? ''))) problems.push(`${it.id}: location is not \`NAME path:line\``);
        }
        if (e.confidence !== undefined && (!Number.isInteger(e.confidence) || e.confidence < 0 || e.confidence > 100))
            problems.push(`${it.id}: confidence is not an integer from 0 to 100`);
    }
    return { items, problems };
}

export function status(items: Item[]) {
    const counts = Object.fromEntries(RESPONSE_STATES.map((s) => [s, 0]));
    for (const it of items) counts[it.state]!++;
    const pending = items.filter((it) => it.state.startsWith('accepted') && !it.applied.length).map((it) => it.id);
    return {
        total: items.length,
        counts,
        open: items.filter((it) => it.state === 'open').map((it) => it.id),
        comments: items
            .filter(
                (it) =>
                    it.state === 'comment' ||
                    it.state.endsWith('-with-comment') ||
                    rulesOf(it).some((r) => String(r.decision ?? '').trim()),
            )
            .map((it) => it.id),
        acceptedNotApplied: pending,
        rejected: items.filter((it) => it.state.startsWith('rejected')).map((it) => it.id),
        resolved: items.every(
            (it) =>
                it.state !== 'open' &&
                it.state !== 'comment' &&
                (!it.state.startsWith('accepted') || it.applied.length),
        ),
    };
}

/**
 * @param argv `render <data.yaml> [--out f] [--append] [--round n] [--sections s.yaml]` | `status <file>` |
 *   `verify <file>` | `lint <file>`
 */
export function reviewCli(argv: string[], roots: { name: string; path: string }[]) {
    const [sub, ...rest] = argv;
    const opts = parseArgs(rest, ['root']);
    const file = opts._[0];
    const load = (f: string) => parseDocument(fs.readFileSync(f, 'utf8')).toJS();
    if (sub === 'render') {
        const data = load(file);
        const existing = opts.out && opts.append && fs.existsSync(opts.out) ? fs.readFileSync(opts.out, 'utf8') : '';
        const last = Math.max(0, ...(existing ? parseReview(existing) : []).map((it) => Number(it.id.slice(2))));
        const sections = opts.sections ? load(opts.sections) : undefined;
        const { yaml } = render(data, { start: last + 1, sections });
        const round = opts.round ? `# Round ${opts.round} — new\n` : '';
        const out = existing ? `${existing.trimEnd()}\n\n${round}${yaml}` : yaml;
        if (opts.out) fs.writeFileSync(opts.out, out.trimEnd() + '\n');
        else process.stdout.write(out);
        return 0;
    }
    const text = fs.readFileSync(file, 'utf8');
    if (sub === 'lint') {
        const { items, problems } = lint(text);
        for (const p of problems) process.stdout.write(p + '\n');
        process.stderr.write(`${items.length} items, ${problems.length} problem(s)\n`);
        return problems.length ? 1 : 0;
    }
    const items = parseReview(text);
    if (sub === 'status') {
        const s = status(items);
        if (opts.json) process.stdout.write(JSON.stringify(s, null, 2) + '\n');
        else {
            process.stdout.write(
                `${s.total} items — ${Object.entries(s.counts)
                    .map(([k, v]) => `${k} ${v}`)
                    .join(', ')}\n`,
            );
            if (s.open.length) process.stdout.write(`open: ${s.open.join(' ')}\n`);
            if (s.comments.length) process.stdout.write(`with comments: ${s.comments.join(' ')}\n`);
            if (s.acceptedNotApplied.length)
                process.stdout.write(`accepted, not yet applied: ${s.acceptedNotApplied.join(' ')}\n`);
            process.stdout.write(s.resolved ? 'resolved: every item answered and applied\n' : 'not resolved\n');
        }
        return s.resolved ? 0 : 1;
    }
    if (sub === 'verify') {
        const problems = verify(items, new Map(roots.map((r) => [r.name, r.path])));
        for (const p of problems) process.stdout.write(p + '\n');
        process.stderr.write(`${items.length} items, ${problems.length} problem(s)\n`);
        return problems.length ? 1 : 0;
    }
    process.stderr.write('usage: spec-tools steward review render|status|verify|lint <file>\n');
    return 2;
}
