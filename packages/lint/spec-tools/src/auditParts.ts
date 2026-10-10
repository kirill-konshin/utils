import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import type * as ts from 'typescript';

import { EVIDENCE_FILE, PARTS_DIR, UNITS_FILE } from './files';
import { root } from './repo';
import { evidenceAt, rootsOf } from './steward/steward';

let loaded: typeof ts | undefined;
/** TypeScript, loaded on first use: only the commands that read source need it, and the bundle runs without it. */
const typescript = (): typeof ts => (loaded ??= createRequire(import.meta.url)('typescript') as typeof ts);

/**
 * The evidence each audit worker judges, assembled here before the audit starts from spec-steward's evidence model
 * (`spec-evidence.json`, which `spec-tools steward evidence --json` writes): one file per capability under `audit-parts/`
 * carrying every requirement verbatim and, under each, the tests bound to it quoted at their real `file:line`, the
 * source lines where its own terms occur with comments stripped, and the other requirements that share its terms; the
 * code and documents that cite it are not evidence, and are left out. A capability larger than one reader holds is
 * cut between its requirements into several such files. A worker reads its part's files and
 * judges; it opens a source only where an excerpt is cut. That is what lets the audit cover its whole scope in minutes
 * rather than rediscover the corpus one search at a time.
 */

/**
 * The evidence one cheap reader holds in full — an evidence file and a part are never larger, unless one requirement
 * alone is. 72 KB was measured on a 200K-token reader (2026-09-12: parts of ~150 KB left a reader short in 4 of 64
 * cases, ~75 KB in 0 of 64); the cheap reader's window is now 1M tokens, so a part is five times that. A reader left
 * short is read again by the completion pass.
 */
export const PART_BYTES = 360 * 1024;

/** An excerpt is the smallest enclosing declaration up to this many lines; past it, a window. */
export const MAX_EXCERPT_LINES = 80;
export const WINDOW_LINES = 30;
/** A term named by more requirements than this says nothing about any one of them. */
export const COMMON_TOKEN_LIMIT = 12;
/** The files a requirement's term occurrences are quoted from; a term found in more files than this is not distinctive. */
export const MAX_CANDIDATE_FILES = 8;
export const MAX_CANDIDATE_LINES_PER_FILE = 3;
export const MAX_RELATED = 8;

/** spec-steward's `spec-evidence.json`, version 1 — the interface; the package's modules are never imported. */
export type EvidenceModel = {
    readonly version: 1;
    readonly root: string;
    readonly requirements: readonly EvidenceRequirement[];
};
export type Gap = {
    readonly tracker: string | null;
    readonly text: string;
    readonly line: number;
    readonly scenario: string | null;
};
export type Binding = {
    readonly file: string;
    readonly line: number;
    readonly anchor: string;
    readonly kind: 'test' | 'file';
    readonly title: string | null;
    readonly window: readonly [number, number];
};
export type Pointer = { readonly file: string; readonly line: number; readonly anchor: string; readonly kind: string };
export type Term = { readonly term: string; readonly hits: readonly { file: string; line: number }[] };
export type EvidenceRequirement = {
    readonly id: string;
    readonly capability: string;
    readonly file: string;
    readonly line: number;
    readonly end: number;
    readonly block: string;
    readonly class: 'required' | 'advisory';
    readonly gaps: readonly Gap[];
    readonly scenarios: readonly { slug: string; line: number; end: number; block: string; bound: boolean }[];
    readonly bindings: readonly Binding[];
    readonly pointers: readonly Pointer[];
    readonly terms: readonly Term[];
    readonly related: readonly { id: string; shared: readonly string[] }[];
};

/** One requirement as the audit tooling reads it. */
export type Requirement = {
    readonly capability: string;
    readonly file: string;
    readonly name: string;
    readonly slug: string;
    readonly line: number;
    readonly endLine: number;
    readonly block: string;
    readonly statement: string;
    readonly scenarioSlugs: readonly string[];
    readonly advisory: boolean;
    readonly gaps: readonly Gap[];
    readonly bindings: readonly Binding[];
    readonly pointers: readonly Pointer[];
    readonly terms: readonly Term[];
    readonly related: readonly { id: string; shared: readonly string[] }[];
};

/** spec-steward's evidence model of the repository at `cwd`, written to its root for the scope and the focused check. */
export function writeEvidence(cwd: string): void {
    fs.writeFileSync(path.join(cwd, EVIDENCE_FILE), JSON.stringify(evidenceAt(rootsOf({}, cwd)[0]!)) + '\n');
}

/** The evidence model at a path; a missing file is the operator's to fix — the scope never guesses its evidence. */
export function loadEvidence(file = path.join(root(), EVIDENCE_FILE)): EvidenceModel {
    if (!fs.existsSync(file))
        throw new Error(
            `${EVIDENCE_FILE} is missing — \`spec-tools scope\` writes it with \`spec-tools steward evidence --json\``,
        );
    const model = JSON.parse(fs.readFileSync(file, 'utf8')) as EvidenceModel;
    if (model.version !== 1 || !Array.isArray(model.requirements))
        throw new Error(`${EVIDENCE_FILE} is not spec-steward's evidence model, version 1`);
    return model;
}

/** A marker line — `**⚠️ Advisory:**`, `**⚠️ Known gap (…):**` — is not the rule's statement. */
const isMarker = (line: string) => /^\*\*⚠️ /.test(line.trim());

/** Every requirement of the evidence model, in the model's order. */
export function requirementsOf(model: EvidenceModel): Requirement[] {
    return model.requirements.map((r) => {
        const lines = r.block.split('\n');
        const heading = lines[0]!.replace(/^### Requirement: /, '');
        const statement = lines.slice(1).find((l) => l.trim() !== '' && !l.startsWith('#') && !isMarker(l)) ?? '';
        return {
            capability: r.capability,
            file: r.file,
            name: heading,
            slug: r.id.slice(r.id.indexOf('#') + 1),
            line: r.line,
            endLine: r.end,
            block: r.block,
            statement: statement.trim(),
            scenarioSlugs: r.scenarios.map((s) => s.slug),
            advisory: r.class === 'advisory',
            gaps: r.gaps,
            bindings: r.bindings,
            pointers: r.pointers,
            terms: r.terms,
            related: r.related,
        };
    });
}

export const idOf = (r: Pick<Requirement, 'capability' | 'slug'>) => `${r.capability}#${r.slug}`;

/**
 * Which terms say something about the files they occur in: named by at most `COMMON_TOKEN_LIMIT` requirements, and
 * found in at least one and at most `MAX_CANDIDATE_FILES` files. A term every second file carries (`path`, `get`)
 * places no requirement anywhere.
 */
export function distinctiveTerms(all: readonly Requirement[]): Set<string> {
    const named = new Map<string, number>();
    const files = new Map<string, number>();
    for (const r of all) {
        for (const t of r.terms) {
            named.set(t.term, (named.get(t.term) ?? 0) + 1);
            files.set(t.term, new Set(t.hits.map((h) => h.file)).size);
        }
    }
    const inFiles = (t: string) => files.get(t) ?? 0;
    return new Set(
        [...named]
            .filter(([t, n]) => n <= COMMON_TOKEN_LIMIT && inFiles(t) > 0 && inFiles(t) <= MAX_CANDIDATE_FILES)
            .map(([t]) => t),
    );
}

/** Reads a source's lines once per run; a file gone from the working tree reads as nothing. */
export type Reader = (file: string) => readonly string[] | undefined;
export function sourceReader(): Reader {
    const cache = new Map<string, readonly string[] | undefined>();
    return (file) => {
        if (!cache.has(file)) {
            try {
                cache.set(file, fs.readFileSync(path.join(root(), file), 'utf8').split('\n'));
            } catch {
                cache.set(file, undefined);
            }
        }
        return cache.get(file);
    };
}

export type Occurrence = {
    readonly file: string;
    readonly terms: readonly string[];
    readonly hits: readonly { file: string; line: number; term: string; text: string }[];
};

/**
 * Where a requirement's terms occur, as the reader is shown it: the files ranked by how many distinctive terms they
 * share with it, then by how many terms, at most `MAX_CANDIDATE_FILES` files and `MAX_CANDIDATE_LINES_PER_FILE`
 * lines each — the lines of distinctive terms first. spec-steward found the hits in the comment-stripped sources; the
 * line shown is the source's own.
 */
export function occurrences(terms: readonly Term[], distinctive: ReadonlySet<string>, read: Reader): Occurrence[] {
    const byFile = new Map<string, { terms: Set<string>; hits: { line: number; term: string }[] }>();
    for (const { term, hits } of terms) {
        for (const h of hits) {
            const entry = byFile.get(h.file) ?? { terms: new Set(), hits: [] };
            entry.terms.add(term);
            entry.hits.push({ line: h.line, term });
            byFile.set(h.file, entry);
        }
    }
    const rare = (shared: Iterable<string>) => [...shared].filter((t) => distinctive.has(t)).length;
    return [...byFile]
        .sort(([a, x], [b, y]) => rare(y.terms) - rare(x.terms) || y.terms.size - x.terms.size || a.localeCompare(b))
        .slice(0, MAX_CANDIDATE_FILES)
        .map(([file, { terms: shared, hits }]) => {
            const seen = new Set<number>();
            const chosen = [...hits]
                .sort((a, b) => Number(distinctive.has(b.term)) - Number(distinctive.has(a.term)) || a.line - b.line)
                .filter((h) => !seen.has(h.line) && seen.add(h.line))
                .slice(0, MAX_CANDIDATE_LINES_PER_FILE)
                .sort((a, b) => a.line - b.line);
            return {
                file,
                terms: [...shared],
                hits: chosen.map((h) => ({
                    file,
                    line: h.line,
                    term: h.term,
                    text: (read(file)?.[h.line - 1] ?? '').trim().slice(0, 160),
                })),
            };
        });
}

export type Excerpt = { readonly startLine: number; readonly text: string; readonly cut: boolean };

/** A quotable unit: a statement, a class member, a callback, or an object literal's entry. */
const isBoundary = (node: ts.Node) =>
    (typescript().isStatement(node) && !typescript().isBlock(node)) ||
    typescript().isClassElement(node) ||
    typescript().isFunctionExpression(node) ||
    typescript().isArrowFunction(node) ||
    typescript().isPropertyAssignment(node);

/** `describe(…)`, `it(…)`, `test(…)`: a call whose callback is the unit a reader wants whole. */
const isCallbackStatement = (node: ts.Node) =>
    typescript().isExpressionStatement(node) &&
    typescript().isCallExpression(node.expression) &&
    node.expression.arguments.some((a) => typescript().isArrowFunction(a) || typescript().isFunctionExpression(a));

/**
 * What an inline citation quotes: the top-level statement, the test block, the class member or the
 * object entry around it — never a lone statement inside a body, which would quote one line.
 */
const isUnit = (node: ts.Node) =>
    (typescript().isStatement(node) && (typescript().isSourceFile(node.parent) || isCallbackStatement(node))) ||
    typescript().isClassElement(node) ||
    typescript().isPropertyAssignment(node);

const lineOf = (sf: ts.SourceFile, pos: number) => sf.getLineAndCharacterOfPosition(pos).line + 1;

/** The quotable units holding `pos`, outermost first. */
export function enclosing(sf: ts.SourceFile, pos: number): ts.Node[] {
    const path: ts.Node[] = [];
    const visit = (node: ts.Node) => {
        if (pos < node.getFullStart() || pos >= node.getEnd()) return;
        if (isBoundary(node)) path.push(node);
        typescript().forEachChild(node, visit);
    };
    typescript().forEachChild(sf, visit);
    return path;
}

/**
 * The first line of a node including the comments above it. Its full start is the end of the previous
 * token, often mid-line, so the comment block begins on the next non-blank line.
 */
function firstLine(sf: ts.SourceFile, lines: readonly string[], node: ts.Node): number {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getFullStart());
    let start = line + 1 + (character > 0 ? 1 : 0);
    const last = lineOf(sf, node.getStart(sf, true));
    while (start < last && lines[start - 1]!.trim() === '') start++;
    return start;
}

const numbered = (lines: readonly string[], startLine: number) =>
    lines.map((line, i) => `${String(startLine + i).padStart(4)}│ ${line}`).join('\n');

const window = (lines: readonly string[], line: number): Excerpt => {
    const start = Math.max(1, line - WINDOW_LINES);
    const end = Math.min(lines.length, line + WINDOW_LINES);
    return { startLine: start, text: numbered(lines.slice(start - 1, end), start), cut: true };
};

const TEST_CALLS = new Set(['describe', 'it', 'test']);

/** A file-level citation's excerpt: the header comment, then one line per top-level declaration and test title. */
function outline(sf: ts.SourceFile, lines: readonly string[], line: number): Excerpt {
    const rows: string[] = [];
    const name = (node: ts.Node): string | undefined => {
        if (typescript().isVariableStatement(node))
            return node.declarationList.declarations.map((d) => d.name.getText(sf)).join(', ');
        if (
            typescript().isFunctionDeclaration(node) ||
            typescript().isClassDeclaration(node) ||
            typescript().isInterfaceDeclaration(node)
        )
            return node.name?.getText(sf);
        if (typescript().isTypeAliasDeclaration(node) || typescript().isEnumDeclaration(node))
            return node.name.getText(sf);
        return undefined;
    };
    const visit = (node: ts.Node) => {
        if (
            typescript().isCallExpression(node) &&
            typescript().isIdentifier(node.expression) &&
            TEST_CALLS.has(node.expression.text)
        ) {
            const title = node.arguments[0];
            if (title && typescript().isStringLiteralLike(title))
                rows.push(
                    `${String(lineOf(sf, node.getStart(sf))).padStart(4)}│ ${node.expression.text}('${title.text}')`,
                );
        }
        typescript().forEachChild(node, visit);
    };
    for (const statement of sf.statements) {
        if (typescript().isImportDeclaration(statement)) continue;
        const label = name(statement);
        if (label)
            rows.push(
                `${String(lineOf(sf, statement.getStart(sf))).padStart(4)}│ ${typescript().SyntaxKind[statement.kind].replace('Declaration', '').replace('Statement', '')} ${label}`,
            );
        visit(statement);
    }
    const header = lines.slice(0, Math.min(lines.length, line + 3));
    const end = header.findIndex((l, i) => i >= line - 1 && /\*\//.test(l));
    const head = numbered(header.slice(0, end === -1 ? line : end + 1), 1);
    return {
        startLine: 1,
        text: `${head}\n   …│ outline of the file — open it to judge an assertion:\n${rows.join('\n')}`,
        cut: true,
    };
}

/** A file this short is quoted whole rather than windowed — a Dockerfile, a small yaml, a config. */
export const WHOLE_FILE_LINES = 150;

/**
 * The code a citation at `line` annotates. In TypeScript a citation in a unit's own doc comment quotes
 * that unit — the function, the class member, the one test — from its comment to its end; a citation
 * inline in a body quotes the outermost enclosing unit that fits the budget. Anything else — a unit
 * past the budget, or a file that is not TypeScript — is a window around the line. Every line carries
 * its number.
 */
export function excerpt(file: string, code: string, line: number): Excerpt {
    const lines = code.split('\n');
    if (!/\.(ts|tsx|mts|cts)$/.test(file)) {
        if (lines.length <= WHOLE_FILE_LINES) return { startLine: 1, text: numbered(lines, 1), cut: false };
        return window(lines, line);
    }
    const sf = typescript().createSourceFile(
        file,
        code,
        typescript().ScriptTarget.Latest,
        true,
        file.endsWith('x') ? typescript().ScriptKind.TSX : typescript().ScriptKind.TS,
    );
    // The citation itself, not the line's indentation — so a one-line doc comment still counts as one.
    const text = lines[line - 1] ?? '';
    const column = Math.max(0, text.indexOf('@link') === -1 ? text.search(/\S/) : text.indexOf('@link'));
    const pos = sf.getPositionOfLineAndCharacter(line - 1, column);
    const path = enclosing(sf, pos);
    const inner = path[path.length - 1];
    if (!inner) return window(lines, line);
    const span = (node: ts.Node) => ({ start: firstLine(sf, lines, node), end: lineOf(sf, node.getEnd()) });
    const fits = (node: ts.Node) => {
        const { start, end } = span(node);
        return end - start + 1 <= MAX_EXCERPT_LINES;
    };
    // In the unit's own doc comment: after the comment opens, before the unit's first token.
    const documented = inner.getStart(sf, true) <= pos && pos < inner.getStart(sf, false);
    // A comment above the imports — or, in a test file, above a fixture or a constant — speaks for
    // the whole file. A short file is then quoted whole, bodies included; a long one as its outline.
    const fileLevel =
        documented &&
        (typescript().isImportDeclaration(inner) ||
            (/\.(test|spec)\.tsx?$/.test(file) &&
                typescript().isSourceFile(inner.parent) &&
                !isCallbackStatement(inner)));
    if (fileLevel) {
        if (lines.length <= WHOLE_FILE_LINES) return { startLine: 1, text: numbered(lines, 1), cut: false };
        return outline(sf, lines, line);
    }
    const chosen = documented ? (fits(inner) ? inner : undefined) : path.filter(isUnit).find(fits);
    if (!chosen) return window(lines, line);
    const { start, end } = span(chosen);
    if (line < start || line > end) return window(lines, line);
    return { startLine: start, text: numbered(lines.slice(start - 1, end), start), cut: false };
}

const fence = (file: string, e: Excerpt) => {
    const lang = /\.(ts|tsx|mts|cts)$/.test(file) ? 'ts' : /\.ya?ml$/.test(file) ? 'yaml' : '';
    return ['```' + lang, e.text, '```'].join('\n');
};

/** What every requirement's evidence is rendered from: the corpus, the distinctive terms and the sources. */
export type Context = {
    readonly all: readonly Requirement[];
    readonly byId: ReadonlyMap<string, Requirement>;
    readonly distinctive: ReadonlySet<string>;
    readonly read: Reader;
    /** The excerpt around a binding, parsed once per run however many units quote it. */
    readonly excerptAt: (file: string, line: number) => Excerpt | undefined;
};

export function contextOf(all: readonly Requirement[], read: Reader = sourceReader()): Context {
    const excerpts = new Map<string, Excerpt | undefined>();
    const excerptAt = (file: string, line: number) => {
        const key = `${file}:${line}`;
        if (!excerpts.has(key)) {
            const lines = read(file);
            excerpts.set(key, lines ? excerpt(file, lines.join('\n'), line) : undefined);
        }
        return excerpts.get(key);
    };
    return { all, byId: new Map(all.map((r) => [idOf(r), r])), distinctive: distinctiveTerms(all), read, excerptAt };
}

const gapNote = (r: Requirement) =>
    r.gaps.length ? ` — records a known gap (${r.gaps.map((g) => g.tracker ?? 'no tracker').join(', ')})` : '';

/**
 * One requirement's evidence, as its reader is shown it: its block; the tests bound to it, each excerpt once with the
 * anchors it binds; where its terms occur; its related requirements.
 * `quoted` lets a capability quote a shared excerpt once.
 */
export function renderRequirement(
    r: Requirement,
    ctx: Context,
    relatedInFull = false,
    quoted?: Map<string, string>,
): string[] {
    const out: string[] = [
        '',
        '---',
        '',
        `\`${idOf(r)}\` — \`${r.file}:${r.line}\`${r.advisory ? ' — ⚠️ Advisory: a finding against it is at most WARN' : ''}${gapNote(r)}`,
        '',
        r.block,
        '',
        '### Bound tests',
    ];
    // One excerpt per enclosing test (or window), with every binding inside it: a test quoted within the suite
    // excerpt that holds it is not quoted again.
    type Quoted = { file: string; line: number; e: Excerpt; binds: string[]; title: string | null };
    const span = (e: Excerpt) => [e.startLine, e.startLine + e.text.split('\n').length - 1] as const;
    const quotedHere: Quoted[] = [];
    const found = r.bindings.flatMap((b) => {
        const e = ctx.excerptAt(b.file, b.line);
        return e ? [{ b, e }] : [];
    });
    // Widest first, so a suite is chosen before the tests inside it.
    for (const { b, e } of found.sort((x, y) => span(y.e)[1] - span(y.e)[0] - (span(x.e)[1] - span(x.e)[0]))) {
        const bind = `#${b.anchor} (:${b.line})`;
        const holder = quotedHere.find(
            (q) => q.file === b.file && span(q.e)[0] <= span(e)[0] && span(e)[1] <= span(q.e)[1],
        );
        if (holder) {
            if (!holder.binds.includes(bind)) holder.binds.push(bind);
            continue;
        }
        quotedHere.push({ file: b.file, line: b.line, e, binds: [bind], title: b.title });
    }
    quotedHere.sort((a, b) => a.file.localeCompare(b.file) || a.e.startLine - b.e.startLine);
    if (quotedHere.length === 0) out.push('', 'No test, type assertion, lint entry or check binds it.');
    for (const { file, line, e, binds, title } of quotedHere) {
        const key = `${file}:${e.startLine}:${e.text}`;
        const [from, to] = span(e);
        const heading = `\`${file}:${line}\`${title ? ` — \`${title.replace(/`/g, "'")}\`` : ''} — binds ${binds.join(', ')}${e.cut ? ` — window, lines ${from}–${to}` : ''}`;
        // The same test bound by several requirements of one capability is quoted once.
        const first = quoted?.get(key);
        if (first) {
            out.push('', `${heading} — the same excerpt as quoted under \`${first}\` above`);
            continue;
        }
        quoted?.set(key, idOf(r));
        out.push('', heading, '', fence(file, e));
    }
    out.push('', '### Where its terms occur');
    if (r.terms.length === 0) {
        out.push(
            '',
            'The requirement names no term. Decide first whether it describes code behaviour at all — a process or documentation rule has nothing to implement; only if it does, search by hand.',
        );
    } else {
        out.push(
            '',
            `Terms: ${r.terms.map((t) => `\`${t.term}\`${ctx.distinctive.has(t.term) ? '' : ' (common)'}`).join(', ')}`,
        );
        const found = occurrences(r.terms, ctx.distinctive, ctx.read);
        if (found.length === 0) out.push('', 'None of them occurs in the sources, comments stripped.');
        for (const c of found) {
            out.push('', `- \`${c.file}\` shares ${c.terms.map((t) => `\`${t}\``).join(', ')}`);
            for (const h of c.hits) out.push(`  - \`${h.file}:${h.line}\` — \`${h.text.replace(/`/g, "'")}\``);
        }
    }
    const rel = r.related.flatMap((x) => {
        const other = ctx.byId.get(x.id);
        return other ? [{ other, shared: x.shared }] : [];
    });
    if (rel.length > 0) {
        out.push('', '### Related requirements — judge for conflict and duplication');
        for (const { other, shared } of rel.slice(0, MAX_RELATED)) {
            const terms = shared.length ? ` (${shared.map((t) => `\`${t}\``).join(', ')})` : ' (similar wording)';
            if (relatedInFull) out.push('', `#### \`${idOf(other)}\`${terms}`, '', other.block);
            else
                out.push(
                    `- \`${idOf(other)}\`${terms} — ${other.statement.slice(0, 240)}${other.statement.length > 240 ? '…' : ''}`,
                );
        }
    }
    return out;
}

/** A capability's evidence file opens with this: what it is, and the capability's Purpose. */
function capabilityHeader(capability: string, ctx: Context, sliced: boolean): string[] {
    const file = ctx.all.find((r) => r.capability === capability)?.file ?? `openspec/specs/${capability}/spec.md`;
    const specLines = ctx.read(file) ?? [];
    const purposeStart = specLines.findIndex((l) => l.startsWith('## Purpose'));
    const purposeEnd = specLines.findIndex((l, i) => i > purposeStart && l.startsWith('## '));
    const purpose =
        purposeStart === -1 ? [] : specLines.slice(purposeStart + 1, purposeEnd === -1 ? undefined : purposeEnd);
    return [
        `# \`${capability}\` — evidence for the specification audit`,
        '',
        `Generated by \`spec-tools scope\` from \`${file}\` and spec-steward's evidence model; line numbers are the files' own. Every requirement is here verbatim with the tests bound to it, where its own terms occur in the sources with comments stripped, and its related requirements — so judge from this file and open a source only where an excerpt is marked as a window or a term occurrence must be confirmed.`,
        ...(sliced
            ? [
                  '',
                  'This capability is larger than one reader holds, so its evidence is cut between its requirements: this file carries some of them, and its other files the rest.',
              ]
            : []),
        '',
        ...(purpose.length ? ['## Purpose', ...purpose] : []),
    ];
}

/** One evidence file's text and the requirements it carries. */
export type EvidenceSlice = { readonly requirements: readonly Requirement[]; readonly text: string };

const textOf = (lines: readonly string[]) => lines.join('\n') + '\n';

/**
 * A capability's evidence, as the files a reader holds in full: the whole capability when it fits in `PART_BYTES`,
 * otherwise cut between its requirements in their spec order — a file closes before the requirement that would take
 * it past `PART_BYTES`, so none is larger unless one requirement alone is, and each repeats the header and Purpose and
 * quotes its own excerpts. A function of the evidence alone: every job that reads the scope sees the same cut.
 */
export function renderCapability(capability: string, ctx: Context): EvidenceSlice[] {
    const own = ctx.all.filter((r) => r.capability === capability);
    const cut = (sliced: boolean): EvidenceSlice[] => {
        const slices: EvidenceSlice[] = [];
        let lines = capabilityHeader(capability, ctx, sliced);
        let taken: Requirement[] = [];
        let quoted = new Map<string, string>();
        for (const r of own) {
            // The same test bound by several requirements is quoted once per file, so a block is sized as this file
            // would quote it, and re-rendered for a fresh file.
            const trial = new Map(quoted);
            const block = renderRequirement(r, ctx, false, trial);
            if (taken.length && Buffer.byteLength(textOf([...lines, ...block])) > PART_BYTES) {
                slices.push({ requirements: taken, text: textOf(lines) });
                quoted = new Map();
                lines = [...capabilityHeader(capability, ctx, sliced), ...renderRequirement(r, ctx, false, quoted)];
                taken = [r];
            } else {
                lines.push(...block);
                taken.push(r);
                quoted = trial;
            }
        }
        slices.push({ requirements: taken, text: textOf(lines) });
        return slices;
    };
    const whole = cut(false);
    return whole.length === 1 ? whole : cut(true);
}

/**
 * The focused evidence for the requirements a change touched: each with its bound tests, where its terms occur, and
 * its related requirements quoted IN FULL, so one reader can judge the edit against the rest before it
 * is handed back — the file `spec-tools changed` writes and the audit's focused mode judges.
 */
export function renderChanged(touched: readonly Requirement[], ctx: Context, base = 'HEAD'): string {
    const out = [
        '# Changed requirements — evidence for the focused check',
        '',
        touched.length
            ? `Generated by \`spec-tools changed\` from the diff against ${base}: ${touched.length} requirement(s) in scope — the ones the diff changed or a touched delta names, the ones whose bound tests or whose own terms the changed files contain, the ones the changed code cites, and the requirements related to these. Judge each against its bound tests, where its terms occur, and the requirements related to it, quoted below.`
            : `Generated by \`spec-tools changed\`: nothing in scope against ${base}.`,
    ];
    for (const r of touched) out.push(...renderRequirement(r, ctx, true));
    return out.join('\n') + '\n';
}

/** What `audit-parts/units.json` holds per unit in scope. */
export type UnitEntry = { advisory?: true };

/** One evidence file the partition places: a whole capability, or a slice of one, with its weight. */
export type EvidenceFile = {
    readonly capability: string;
    readonly file: string;
    readonly bytes: number;
    readonly requirements: number;
    readonly requirementIds: readonly string[];
};

/**
 * Writes each capability's evidence files and `units.json`; returns each file with its weight — `<capability>.md` for a
 * capability whole, `<capability>.<k>.md` for its k-th slice.
 */
export function writeParts(
    capabilities: readonly string[],
    all: readonly Requirement[] = requirementsOf(loadEvidence()),
): EvidenceFile[] {
    const ctx = contextOf(all);
    const dir = path.join(root(), PARTS_DIR);
    // Regenerating the evidence replaces the evidence only: `findings/` and `steward/` hold the audits' output, and a
    // scope regenerated after an audit must not erase what the audit found.
    if (fs.existsSync(dir)) {
        for (const entry of fs.readdirSync(dir)) {
            if (entry !== 'findings' && entry !== 'steward') fs.rmSync(path.join(dir, entry), { recursive: true });
        }
    }
    fs.mkdirSync(path.join(dir, 'findings'), { recursive: true });
    // Every unit in scope with its class.
    const units: Record<string, UnitEntry> = {};
    for (const r of all) {
        if (capabilities.includes(r.capability)) units[idOf(r)] = r.advisory ? { advisory: true } : {};
    }
    fs.writeFileSync(path.join(root(), UNITS_FILE), JSON.stringify(units, null, 1) + '\n');
    return capabilities.flatMap((capability) => {
        const slices = renderCapability(capability, ctx);
        return slices.map(({ requirements, text }, k) => {
            const file = `${PARTS_DIR}/${capability}${slices.length > 1 ? `.${k + 1}` : ''}.md`;
            fs.mkdirSync(path.dirname(path.join(root(), file)), { recursive: true });
            fs.writeFileSync(path.join(root(), file), text);
            return {
                capability,
                file,
                bytes: Buffer.byteLength(text),
                requirements: requirements.length,
                requirementIds: requirements.map(idOf),
            };
        });
    });
}
