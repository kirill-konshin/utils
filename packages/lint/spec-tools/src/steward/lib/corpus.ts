/**
 * The OpenSpec corpus as data: capabilities, requirements, scenarios, each with its line and anchor, and the two
 * markers a requirement can carry — `**⚠️ Advisory:**` (its class) and `**⚠️ Known gap (<tracker>):**` (a gap,
 * exempting the scenarios it names by title).
 */
import fs from 'node:fs';
import path from 'node:path';

import { filesAt, showMany } from './git';
import { slugify, stripCode, strongCount, weakCount } from './util';

export type Step = { kw: string; text: string; line: number };
export type Marker = {
    label: string;
    tracker: string | null;
    line: number;
    text: string;
    scenario: string | null;
    inline: boolean;
};
export type Gap = { tracker: string; text: string; line: number; exempts: string[]; named: boolean };
export type Scenario = {
    name: string;
    slug: string;
    line: number;
    end: number;
    block: string;
    steps: Step[];
    markers: Marker[];
};
export type Requirement = {
    capability: string;
    file: string;
    name: string;
    slug: string;
    id: string;
    line: number;
    end: number;
    block: string;
    statement: string;
    statementLine: number;
    markers: Marker[];
    scenarios: Scenario[];
    strong: number;
    weak: number;
    advisory: boolean;
    gaps: Gap[];
};
export type DuplicateHeading = { line: number; slug: string; first: number };
export type Capability = {
    capability: string;
    file: string;
    purpose: string;
    slugs: Set<string>;
    requirements: Requirement[];
    duplicates: DuplicateHeading[];
};
export type Corpus = { name: string; path: string; specsDir: string; capabilities: Capability[] };

export const DEFAULT_SPECS_DIR = 'openspec/specs';

/** The two canonical markers; `<tracker>` is required text (a ticket key, a tickets-page id or a change folder). */
export const DEFAULT_MARKERS = ['**⚠️ Advisory:**', '**⚠️ Known gap (<tracker>):**'];
export const ADVISORY = 'Advisory';
export const KNOWN_GAP = 'Known gap';
export const RETIRED = 'Unenforced';

/** A marker on a line of its own: `**⚠️ Label (tracker):**`, tolerant of the spellings `marker-hygiene` repairs. */
const MARKER = /^\s*\*\*(?:⚠️?\s*)?([A-Z][\w -]{1,40}?)\s*(?:\(([^()\n]*)\))?\s*:?\s*\*\*\s*:?/u;
/** A marker spelling inside a line, where no tool reads it. */
const INLINE_MARKER =
    /\S.*?\*\*(?:⚠️?\s*)?(Advisory|Known [Gg]ap|Unenforced)\s*(?:\([^()\n]*\))?\s*(?::\s*\*\*|\*\*\s*:)/u;
const STEP = /^\s*[-*]\s+\*\*(GIVEN|WHEN|THEN|AND|BUT)\*\*\s*(.*)$/i;
const LABELS = new Map([ADVISORY, KNOWN_GAP, RETIRED].map((l) => [l.toLowerCase(), l]));
const QUOTES = [`'…'`, `"…"`, `‘…’`, `“…”`, `_…_`, `*…*`];

/**
 * The scenarios a Known gap names by title after "exempts" (quoted '…', "…", ‘…’, “…”, _…_ or *…*); null when it
 * names none that way.
 */
function namedIn(text: string, scenarios: Scenario[]) {
    const clause = /\bexempts?\b([\s\S]*)$/i.exec(text)?.[1].toLowerCase();
    if (clause === undefined) return null;
    const quoted = (name: string) => QUOTES.map((q) => q.replace('…', name.toLowerCase()));
    return scenarios.filter((s) => quoted(s.name).some((q) => clause.includes(q))).map((s) => s.slug);
}

/**
 * Parse one capability specification.
 *
 * @param file repository-relative path of the spec.md
 */
export function parseSpec(text: string, file: string, capability: string): Capability {
    const lines = text.split('\n');
    const seen = new Map();

    const firstAt: Map<string, number> = new Map();

    const duplicates: DuplicateHeading[] = [];

    const requirements: Requirement[] = [];

    const slugs: Set<string> = new Set();

    let req: Requirement | null = null;

    let scen: Scenario | null = null;
    let section = '';
    const purpose: string[] = [];
    const blockOf = (from: number, to: number) =>
        lines
            .slice(from - 1, to)
            .join('\n')
            .trimEnd();

    const closeScenario = (end: number) => {
        if (!scen) return;
        scen.end = end;
        scen.block = blockOf(scen.line, end);
        scen = null;
    };

    const close = (end: number) => {
        closeScenario(end);
        if (!req) return;
        const r = req;
        r.end = end;
        r.block = blockOf(r.line, end);
        const statementEnd = r.scenarios[0] ? r.scenarios[0].line - 1 : end;
        const markerLines = new Set(r.markers.filter((m) => !m.inline).map((m) => m.line));
        r.statement = lines
            .slice(r.line, statementEnd)
            .filter((_, k) => !markerLines.has(r.line + 1 + k))
            .join('\n')
            .trim();
        r.strong = strongCount(r.statement);
        r.weak = weakCount(r.statement);
        const own = r.markers.filter((m) => !m.inline);
        r.advisory = own.some((m) => m.label === ADVISORY && !m.scenario);
        r.gaps = own
            .filter((m) => m.label === KNOWN_GAP && m.tracker && !m.scenario)
            .map((m) => {
                const named = namedIn(m.text, r.scenarios);
                return {
                    tracker: m.tracker as string,
                    text: m.text,
                    line: m.line,
                    exempts: named ?? [],
                    named: named !== null,
                };
            });
        requirements.push(r);
        req = null;
    };

    lines.forEach((raw, i) => {
        const n = i + 1;
        const h = /^(#{1,6})\s+(.+?)\s*$/.exec(raw);
        if (h) {
            const level = h[1].length;
            const title = h[2];
            const base = slugify(title);
            const first = firstAt.get(base);
            if (first) duplicates.push({ line: n, slug: base, first });
            else firstAt.set(base, n);
            const slug = slugify(title, seen);
            slugs.add(slug);
            const r = level === 3 && /^Requirement:\s*(.+)$/.exec(title);
            const s = level === 4 && /^Scenario:\s*(.+)$/.exec(title);
            if (level <= 3) {
                close(n - 1);
                section = level === 2 ? title : section;
            }
            if (r) {
                req = {
                    capability,
                    file,
                    name: r[1],
                    slug,
                    id: `${capability}#${slug}`,
                    line: n,
                    end: n,
                    block: '',
                    statement: '',
                    statementLine: n + 1,
                    markers: [],
                    scenarios: [],
                    strong: 0,
                    weak: 0,
                    advisory: false,
                    gaps: [],
                };
            } else if (s && req) {
                closeScenario(n - 1);
                scen = { name: s[1], slug, line: n, end: n, block: '', steps: [], markers: [] };
                req.scenarios.push(scen);
            } else if (level === 4) closeScenario(n - 1);
            return;
        }
        if (section === 'Purpose' && !req) purpose.push(raw);
        if (!req) return;
        const atStart = MARKER.exec(raw);
        const m = atStart && LABELS.has(atStart[1].trim().toLowerCase()) ? atStart : null;
        const inline = !atStart && INLINE_MARKER.exec(stripCode(raw));
        if (m || inline) {
            const found = (m || inline) as RegExpExecArray;
            const label = LABELS.get(found[1].trim().toLowerCase()) as string;

            const marker: Marker = {
                label,
                tracker: m ? m[2]?.trim() || null : null,
                line: n,
                text: raw.trim(),
                scenario: scen ? scen.slug : null,
                inline: !m,
            };
            req.markers.push(marker);
            scen?.markers.push(marker);
        }
        const st = scen && STEP.exec(raw);
        if (st && scen) scen.steps.push({ kw: st[1].toUpperCase(), text: st[2].trim(), line: n });
    });
    close(lines.length);
    return { capability, file, purpose: purpose.join('\n').trim(), slugs, requirements, duplicates };
}

/** Every spec.md under a directory on disk. */
function walkSpecs(dir: string) {
    const out: string[] = [];
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walkSpecs(p));
        else if (entry.name === 'spec.md') out.push(p);
    }
    return out.sort();
}

/** `openspec/specs/billing/refunds/spec.md` → `billing/refunds`. */
export const capabilityOf = (specsDir: string, file: string) =>
    path.relative(specsDir, path.dirname(file)).split(path.sep).join('/');

/**
 * The corpus as the working tree holds it.
 * @param root absolute repository root
 */
export function loadCorpus(
    root: string,
    { name = path.basename(root), specsDir = DEFAULT_SPECS_DIR }: { name?: string; specsDir?: string } = {},
): Corpus {
    const abs = path.join(root, specsDir);
    const capabilities = walkSpecs(abs).map((p) => {
        const file = path.relative(root, p).split(path.sep).join('/');
        return parseSpec(fs.readFileSync(p, 'utf8'), file, capabilityOf(specsDir, file));
    });
    return { name, path: root, specsDir, capabilities };
}

/** The corpus as a git ref holds it. */
export function loadCorpusAt(
    root: string,
    ref: string,
    { name = path.basename(root), specsDir = DEFAULT_SPECS_DIR }: { name?: string; specsDir?: string } = {},
): Corpus {
    const files = filesAt(root, ref, specsDir)
        .filter((f) => f.endsWith('/spec.md'))
        .sort();
    const texts = showMany(root, ref, files);
    const capabilities = files.map((file) => parseSpec(texts.get(file) ?? '', file, capabilityOf(specsDir, file)));
    return { name, path: root, specsDir, capabilities };
}

/** Every requirement of a corpus. */
export const allRequirements = (corpus: Corpus) => corpus.capabilities.flatMap((c) => c.requirements);

/** Which corpus file a repository-relative path is, if any. */
export const capabilityByFile = (corpus: Corpus, file: string) => corpus.capabilities.find((c) => c.file === file);

/** Whether a scenario is exempt from the ratchet by a Known gap. */
export const gapExempts = (r: Requirement, s: Scenario) => r.gaps.some((g) => g.exempts.includes(s.slug));
