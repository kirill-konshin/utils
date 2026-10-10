/**
 * The review file: rendered from audit findings, answered by the owner item by item, processed round by round.
 * Format: references/review-format.md.
 */
import fs from 'node:fs';
import path from 'node:path';

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
export type Item = {
    id: string;
    line: number;
    end: number;
    heading: string;
    theme: boolean;
    members: { quote: string; location: string; line: number; comments: string[] }[];
    quote: string;
    location: string;
    response: string;
    responseLine: number;
    state: string;
    applied: string[];
};

const RESPONSE_STATES = ['open', 'accepted', 'accepted-with-comment', 'comment', 'rejected', 'rejected-with-comment'];

const oneLine = (text: string) => normalize(String(text ?? '')).replace(/\s*\n\s*/g, ' ');

const location = (f: Finding) => `\`${f.repo} ${f.file}:${f.line}\``;

const quoted = (q: string) => `“${oneLine(q).replace(/[“”]/g, '"')}”`;

/** The extra context a reader needs to decide: evidence, cross references, intent, reversal. */
function context(f: Finding | Theme) {
    const parts = [];
    if ('reversesPastDecision' in f && f.reversesPastDecision)
        parts.push(`Reverses an earlier decision: ${oneLine(f.reversesPastDecision).replace(/[.\s]+$/, '')}.`);
    if ('evidence' in f && f.evidence?.length)
        parts.push(
            `Evidence: ${f.evidence
                .slice(0, 6)
                .map((e) => `\`${e}\``)
                .join(', ')}.`,
        );
    if ('crossRefs' in f && f.crossRefs?.length) parts.push(`See also: ${f.crossRefs.slice(0, 6).join(', ')}.`);
    return parts.length ? ` ${parts.join(' ')}` : '';
}

/** One item in the mandated five-bullet shape. */
export function renderItem(id: string, item: Finding | Theme, theme: boolean) {
    const crit = (item.criteria ?? []).join(', ');
    const intent = item.needsHumanIntent ? ' · ❓ intent' : '';
    if (!theme) {
        const f = item as Finding;
        return [
            `### ${id} · ${f.layer} · ${f.repo} ${f.area ?? ''}`.trimEnd() + `${crit ? ` · ${crit}` : ''}${intent}`,
            '',
            `* Rule: ${quoted(f.quote)}`,
            `   * Location: ${location(f)}`,
            `   * What’s wrong: ${oneLine(f.whatsWrong)}${context(f)}`,
            `   * Proposed: ${oneLine(f.proposed)}`,
            `   * My response: ⬜`,
            '',
        ].join('\n');
    }
    const t = item as Theme;
    return [
        `### ${id} · ${t.layer} · Theme: ${oneLine(t.title)}${crit ? ` · ${crit}` : ''}${intent}`,
        '',
        `* Rule: ${quoted(t.title)} — ${t.members.length} rules:`,
        ...t.members.map((m) => `   * ${quoted(m.quote)} — ${location(m)}${m.note ? ` — ${oneLine(m.note)}` : ''}`),
        `   * Location: each member above`,
        `   * What’s wrong: ${oneLine(t.whatsWrong)}`,
        `   * Proposed: ${oneLine(t.proposed)}`,
        `   * My response: ⬜`,
        '',
    ].join('\n');
}

/** Render audit output into review sections. */
/** A section of the review file: the areas it gathers, under its title and an optional introduction. */
export type Section = { key: string; title: string; areas?: (string | undefined)[]; intro?: string };

export function render(
    data: { themes?: readonly Theme[]; findings?: readonly Finding[] },
    { start = 1, sections }: { start?: number; sections?: Section[] } = {},
) {
    let n = start;
    const next = () => `R-${String(n++).padStart(3, '0')}`;
    const themes = data.themes ?? [];
    const findings = data.findings ?? [];
    const areaOfTheme = (t: Theme) => {
        const counts = new Map();
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
    const out = [];
    for (const s of layout) {
        const areas = new Set(s.areas ?? [s.key]);
        const ts = themes.filter((t) => areas.has(areaOfTheme(t)));
        const fs = findings.filter((f) => areas.has(f.area));
        if (!ts.length && !fs.length) continue;
        out.push(`## ${s.title}`, '');
        if (s.intro) out.push(s.intro, '');
        for (const t of ts) out.push(renderItem(next(), t, true));
        for (const f of fs.sort(
            (a, b) => a.repo.localeCompare(b.repo) || a.file.localeCompare(b.file) || a.line - b.line,
        ))
            out.push(renderItem(next(), f, false));
    }
    return { markdown: out.join('\n'), next: n };
}

const ITEM = /^###\s+(R-\d+)\b(.*)$/;
const FIELD =
    /^\s*[*-]\s+(Rule|Location|What[’']s wrong|Proposed|My response|Applied|Previous response[^:]*)\s*:\s?(.*)$/;
const MEMBER = /^\s{2,}[*-]\s+“(.+?)”\s+—\s+`([^`]+)`/;

export function stateOf(response: string) {
    const r = response.trim();
    if (!r || r === '⬜') return 'open';
    if (r.startsWith('✅')) return r.replace('✅', '').trim() ? 'accepted-with-comment' : 'accepted';
    if (r.startsWith('❌')) return r.replace('❌', '').trim() ? 'rejected-with-comment' : 'rejected';
    if (r.startsWith('⬜')) return r.replace('⬜', '').trim() ? 'comment' : 'open';
    return 'comment';
}

/** Parse a review file into items. */
export function parseReview(text: string): Item[] {
    const lines = text.split('\n');

    const items: Item[] = [];

    let cur: Item | null = null;
    let field = '';
    lines.forEach((line, i) => {
        const h = ITEM.exec(line);
        if (h || /^#{1,3}\s/.test(line)) {
            if (cur) cur.end = i;
            cur = null;
            field = '';
            if (h) {
                cur = {
                    id: h[1],
                    line: i + 1,
                    end: lines.length,
                    heading: h[2],
                    theme: /Theme:/.test(h[2]),
                    members: [],
                    quote: '',
                    location: '',
                    response: '',
                    responseLine: 0,
                    state: 'open',
                    applied: [],
                };
                items.push(cur);
            }
            return;
        }
        if (!cur) return;
        const f = FIELD.exec(line);
        if (f) {
            field = f[1].replace('’', "'");
            if (field === 'Rule') cur.quote = f[2];
            else if (field === 'Location') cur.location = f[2];
            else if (field === 'My response') {
                cur.response = f[2];
                cur.responseLine = i + 1;
            } else if (field === 'Applied') cur.applied.push(f[2]);
            return;
        }
        const m = MEMBER.exec(line);
        if (m && cur.theme && field === 'Rule') {
            cur.members.push({ quote: m[1], location: m[2], line: i + 1, comments: [] });
            return;
        }
        if (!line.trim()) return;
        if (field === 'My response') cur.response += `\n${line.trim()}`;
        else if (field === 'Rule' && cur.members.length) cur.members[cur.members.length - 1].comments.push(line.trim());
    });
    for (const it of items) it.state = stateOf(it.response);
    return items;
}

/** Locations a review names: `NAME path:line`. */
const parseLocation = (loc: string) => {
    const m = /`?([\w-]+)\s+([^`\s]+):(\d+)`?/.exec(loc);
    return m ? { repo: m[1], file: m[2], line: Number(m[3]) } : null;
};

/**
 * Every quote must be found, fragment by fragment in order, at its location (a window from the line on).
 *
 * @param roots NAME → absolute path
 */
export function verify(items: Item[], roots: Map<string, string>) {
    const problems: string[] = [];
    const cache = new Map();
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
        const q = quote.replace(/^“|”$/g, '').replace(/[“”]/g, '"');
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
    for (const it of items) {
        if (it.theme) for (const m of it.members) check(it.id, m.quote, m.location);
        else check(it.id, it.quote.replace(/^\s*/, ''), it.location);
    }
    return problems;
}

export function lint(text: string, items: Item[]) {
    const problems: string[] = [];
    const seen = new Set();
    const lines = text.split('\n');
    for (const it of items) {
        if (seen.has(it.id)) problems.push(`${it.id}: duplicate id`);
        seen.add(it.id);
        const body = lines.slice(it.line - 1, it.end).join('\n');
        for (const field of ['Rule', 'Location', "What’s wrong|What's wrong", 'Proposed', 'My response'])
            if (!new RegExp(`^\\s*[*-]\\s+(?:${field})\\s*:`, 'm').test(body))
                problems.push(`${it.id}: missing "${field.split('|')[0]}"`);
        if (!it.theme && !/^\s*“.+”/.test(it.quote)) problems.push(`${it.id}: the rule is not quoted “…”`);
        if (!it.theme && !parseLocation(it.location)) problems.push(`${it.id}: location is not \`NAME path:line\``);
        if (it.theme && !it.members.length) problems.push(`${it.id}: a theme lists no members`);
        if (!it.responseLine) problems.push(`${it.id}: no response line`);
    }
    return problems;
}

export function status(items: Item[]) {
    const counts = Object.fromEntries(RESPONSE_STATES.map((s) => [s, 0]));
    for (const it of items) counts[it.state]++;
    const pending = items.filter((it) => it.state.startsWith('accepted') && !it.applied.length).map((it) => it.id);
    const memberComments = items.filter((it) => it.members.some((m) => m.comments.length)).map((it) => it.id);
    return {
        total: items.length,
        counts,
        open: items.filter((it) => it.state === 'open').map((it) => it.id),
        comments: items.filter((it) => it.state === 'comment' || it.state.endsWith('-with-comment')).map((it) => it.id),
        acceptedNotApplied: pending,
        rejected: items.filter((it) => it.state.startsWith('rejected')).map((it) => it.id),
        memberComments,
        resolved: items.every(
            (it) =>
                it.state !== 'open' &&
                it.state !== 'comment' &&
                (!it.state.startsWith('accepted') || it.applied.length),
        ),
    };
}

/**
 * @param argv `render <data.json> [--out f] [--append] [--sections s.json]` | `status <file>` | `verify <file>` | `lint <file>`
 */
export function reviewCli(argv: string[], roots: { name: string; path: string }[]) {
    const [sub, ...rest] = argv;
    const opts = parseArgs(rest, ['root']);
    const file = opts._[0];
    if (sub === 'render') {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        const existing = opts.out && opts.append && fs.existsSync(opts.out) ? fs.readFileSync(opts.out, 'utf8') : '';
        const last = Math.max(0, ...parseReview(existing).map((it) => Number(it.id.slice(2))));
        const sections = opts.sections ? JSON.parse(fs.readFileSync(opts.sections, 'utf8')) : undefined;
        const { markdown } = render(data, { start: last + 1, sections });
        const round = opts.round ? `## Round ${opts.round} — new\n\n` : '';
        const out = existing ? `${existing.trimEnd()}\n\n${round}${markdown}` : markdown;
        if (opts.out) fs.writeFileSync(opts.out, out.trimEnd() + '\n');
        else process.stdout.write(out);
        return 0;
    }
    const text = fs.readFileSync(file, 'utf8');
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
            if (s.memberComments.length)
                process.stdout.write(`themes with member comments: ${s.memberComments.join(' ')}\n`);
            if (s.acceptedNotApplied.length)
                process.stdout.write(`accepted, not yet applied: ${s.acceptedNotApplied.join(' ')}\n`);
            process.stdout.write(s.resolved ? 'resolved: every item answered and applied\n' : 'not resolved\n');
        }
        return s.resolved ? 0 : 1;
    }
    if (sub === 'verify' || sub === 'lint') {
        const problems =
            sub === 'lint' ? lint(text, items) : verify(items, new Map(roots.map((r) => [r.name, r.path])));
        for (const p of problems) process.stdout.write(p + '\n');
        process.stderr.write(`${items.length} items, ${problems.length} problem(s)\n`);
        return problems.length ? 1 : 0;
    }
    process.stderr.write('usage: spec-tools steward review render|status|verify|lint <file>\n');
    return 2;
}
