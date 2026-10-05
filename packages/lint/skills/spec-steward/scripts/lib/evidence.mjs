// @ts-check
/**
 * Evidence for an audit, assembled mechanically so a reader judges instead of searching. For every requirement: the
 * tests bound to it and its scenarios, and where its own terms occur in the sources with comments stripped. Code
 * citations are optional pointers, listed when present and never evidence. Every excerpt keeps its file's own line
 * numbers. Two shapes: per-capability Markdown bundles (`evidence --out`) and one JSON model (`evidence --json`).
 */
import fs from 'node:fs';
import path from 'node:path';

import { isTestFile } from './citations.mjs';
import { allRequirements } from './corpus.mjs';
import { listFiles } from './git.mjs';
import { stripComments } from './scan.mjs';
import { codeTokens, jaccard, sentences, words } from './util.mjs';

/**
 * @typedef {import('./corpus.mjs').Corpus} Corpus
 * @typedef {import('./corpus.mjs').Requirement} Requirement
 * @typedef {import('./citations.mjs').Citation} Citation
 * @typedef {{ file: string, text: string, lines: string[] }} Source text has its comments blanked; lines are as written
 */

const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|ya?ml|json|sh|py|go|conf|toml|sql|tpl|Dockerfile)$|(?:^|\/)Dockerfile[^/]*$/;
const SOURCE_SKIP =
    /(?:^|\/)(?:node_modules|dist|build|coverage|\.nx|\.yarn|\.yalc|\.git|docs\/build|\.docusaurus)(?:\/|$)|^openspec\/|(?:^|\/)(?:yarn\.lock|package-lock\.json|pnpm-lock\.yaml)$/;
const COMMON = new Set([
    'true',
    'false',
    'null',
    'undefined',
    'string',
    'number',
    'object',
    'id',
    'url',
    'name',
    'type',
]);

/** Lines `[from, to]` of a file with their numbers. @param {string[]} lines @param {number} from @param {number} to */
const numbered = (lines, from, to) =>
    lines
        .slice(from - 1, to)
        .map((l, i) => `${String(from + i).padStart(5)}│ ${l}`)
        .join('\n');

/** @param {string} file */
const fence = (file) =>
    /\.(?:[cm]?[jt]sx?)$/.test(file) ? 'ts' : /\.ya?ml$/.test(file) ? 'yaml' : /\.json$/.test(file) ? 'json' : '';

/**
 * The non-test source files of a repository, read once, comments blanked for searching.
 * @param {string} root
 * @returns {Source[]}
 */
export function sourceIndex(root) {
    return (listFiles(root) ?? [])
        .filter((f) => SOURCE_EXT.test(f) && !SOURCE_SKIP.test(f) && !isTestFile(f))
        .flatMap((file) => {
            try {
                const raw = fs.readFileSync(path.join(root, file), 'utf8');
                return raw.length < 400_000 && !raw.includes('\0')
                    ? [{ file, text: stripComments(file, raw), lines: raw.split('\n') }]
                    : [];
            } catch {
                return [];
            }
        });
}

/** Terms worth searching for: the identifiers a requirement names in backticks. @param {Requirement} r */
export const searchTerms = (r) =>
    [...new Set(codeTokens(r.block))].filter(
        (t) => t.length >= 3 && /^[\w$.@/:<>-]+$/.test(t) && !COMMON.has(t.toLowerCase()),
    );

/** A term as a pattern: an identifier-like end never matches inside a longer identifier. @param {string} term */
const termPattern = (term) =>
    new RegExp(
        `${/^[\w$]/.test(term) ? '(?<![\\w$])' : ''}${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${/[\w$]$/.test(term) ? '(?![\\w$])' : ''}`,
        'g',
    );

/**
 * Every line of a source the term occurs on, comments stripped.
 * @param {string} term
 * @param {Source[]} sources
 * @returns {{ file: string, line: number }[]}
 */
export function termHits(term, sources) {
    const re = termPattern(term);
    const hits = [];
    for (const s of sources) {
        let line = 1;
        let from = 0;
        let last = -1;
        for (const m of s.text.matchAll(re)) {
            for (let i = s.text.indexOf('\n', from); i >= 0 && i < (m.index ?? 0); i = s.text.indexOf('\n', i + 1)) {
                line++;
                from = i + 1;
            }
            if (line !== last) hits.push({ file: s.file, line });
            last = line;
        }
    }
    return hits;
}

/**
 * Requirements sharing terms or wording with `r`, strongest first.
 * @param {Requirement} r
 * @param {{ corpus: Corpus, requirement: Requirement }[]} everywhere
 * @param {Corpus} corpus
 */
function relatedOf(r, everywhere, corpus) {
    const mine = new Set(searchTerms(r));
    const myWords = words(r.statement);
    return everywhere
        .filter((x) => x.requirement.id !== r.id || x.corpus.name !== corpus.name)
        .map((x) => {
            const shared = searchTerms(x.requirement).filter((t) => mine.has(t));
            return { x, shared, score: shared.length + jaccard(myWords, words(x.requirement.statement)) * 3 };
        })
        .filter((y) => y.shared.length || y.score >= 1.2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
}

/** The citations of a requirement's anchors. @param {Requirement} r @param {Citation[]} citations */
function citationsOf(r, citations) {
    const anchors = new Set([`${r.file}#${r.slug}`, ...r.scenarios.map((s) => `${r.file}#${s.slug}`)]);
    return citations.filter((c) => c.anchor && c.resolves && anchors.has(`${c.target}#${c.anchor}`));
}

/**
 * The audit's evidence model for one repository, `spec-evidence.json`.
 * @param {Corpus} corpus
 * @param {Citation[]} citations
 * @param {Source[]} sources
 */
export function evidenceModel(corpus, citations, sources) {
    const everywhere = allRequirements(corpus).map((requirement) => ({ corpus, requirement }));
    /** @type {Map<string, { file: string, line: number }[]>} */
    const hitsByTerm = new Map();
    const hitsOf = (/** @type {string} */ term) => {
        if (!hitsByTerm.has(term)) hitsByTerm.set(term, termHits(term, sources));
        return /** @type {{ file: string, line: number }[]} */ (hitsByTerm.get(term));
    };
    return {
        version: 1,
        root: corpus.name,
        requirements: allRequirements(corpus).map((r) => {
            const cites = citationsOf(r, citations);
            const bound = new Set(cites.filter((c) => c.binding).map((c) => c.anchor));
            return {
                id: r.id,
                capability: r.capability,
                file: r.file,
                line: r.line,
                end: r.end,
                block: r.block,
                class: r.advisory ? 'advisory' : 'required',
                gaps: r.gaps.map((g) => ({
                    tracker: g.tracker,
                    text: g.text,
                    line: g.line,
                    scenario: g.scenario,
                    exempts: g.exempts,
                })),
                scenarios: r.scenarios.map((s) => ({
                    slug: s.slug,
                    line: s.line,
                    end: s.end,
                    block: s.block,
                    bound: bound.has(s.slug) || (r.scenarios.length === 1 && bound.has(r.slug)),
                })),
                bindings: cites
                    .filter((c) => c.binding)
                    .map((c) => ({
                        file: c.file,
                        line: c.line,
                        anchor: c.anchor,
                        kind: c.binding,
                        title: c.testTitle ?? null,
                        window: c.window,
                    })),
                pointers: cites
                    .filter((c) => !c.binding)
                    .map((c) => ({
                        file: c.file,
                        line: c.line,
                        anchor: c.anchor,
                        kind: c.kind === 'doc' ? 'doc' : 'code',
                    })),
                terms: searchTerms(r).map((term) => ({ term, hits: hitsOf(term) })),
                related: relatedOf(r, everywhere, corpus).map(({ x, shared }) => ({ id: x.requirement.id, shared })),
            };
        }),
    };
}

/**
 * One capability's evidence, as markdown.
 * @param {Corpus} corpus
 * @param {import('./corpus.mjs').Capability} cap
 * @param {Citation[]} citations
 * @param {Source[]} sources
 * @param {{ corpus: Corpus, requirement: Requirement }[]} everywhere every requirement of every corpus in the run
 */
export function capabilityEvidence(corpus, cap, citations, sources, everywhere) {
    const specLines = fs.readFileSync(path.join(corpus.path, cap.file), 'utf8').split('\n');
    const fileLines = new Map();
    const linesOf = (/** @type {string} */ f) => {
        if (!fileLines.has(f)) fileLines.set(f, fs.readFileSync(path.join(corpus.path, f), 'utf8').split('\n'));
        return fileLines.get(f);
    };
    const out = [
        `# ${corpus.name} \`${cap.capability}\` — evidence`,
        '',
        `Spec \`${cap.file}\` in ${corpus.name} (\`${corpus.path}\`). Generated by spec-steward; every excerpt keeps its file's own line numbers. Bound tests come first: a test block, type assertion or lint entry citing a scenario is the binding that matters. Code citations are optional pointers, never evidence; "where its terms occur" is a search of comment-stripped sources, a lead to read, not a verdict.`,
        '',
        '## Purpose',
        '',
        cap.purpose || '_(none)_',
        '',
    ];
    for (const r of cap.requirements) {
        const cites = citationsOf(r, citations);
        const tests = cites.filter((c) => c.binding);
        const code = cites.filter((c) => !c.binding);
        out.push(
            '---',
            '',
            `## \`${r.id}\` — \`${r.file}:${r.line}\`${r.advisory ? ' — ⚠️ Advisory' : ''}`,
            '',
            '```md',
            numbered(specLines, r.line, r.end),
            '```',
            '',
        );

        out.push(`### Bound tests (${tests.length})`, '');
        if (!tests.length) out.push('_Nothing binds this requirement or its scenarios._', '');
        for (const t of tests) {
            const lines = linesOf(t.file);
            const [from, to] = [Math.max(1, t.window[0]), Math.min(lines.length, t.window[1], t.window[0] + 70)];
            out.push(
                `\`${t.file}:${t.line}\` → \`#${t.anchor}\`${t.testTitle ? ` — "${t.testTitle}"` : ''}${to < t.window[1] ? ' (window cut)' : ''}`,
                '',
                '```' + fence(t.file),
                numbered(lines, from, to),
                '```',
                '',
            );
        }
        if (code.length) {
            out.push(`### Pointers (${code.length}) — code citations, not evidence`, '');
            for (const c of code) {
                const lines = linesOf(c.file);
                out.push(
                    `\`${c.file}:${c.line}\``,
                    '',
                    '```' + fence(c.file),
                    numbered(lines, Math.max(1, c.line - 2), Math.min(lines.length, c.line + 20)),
                    '```',
                    '',
                );
            }
        }
        const terms = searchTerms(r);
        const hits = [];
        for (const term of terms.slice(0, 8)) {
            const found = termHits(term, sources).slice(0, 3);
            for (const h of found) {
                const src = sources.find((s) => s.file === h.file);
                const text = (src?.lines[h.line - 1] ?? '').trim().slice(0, 160).replace(/`/g, "'");
                hits.push(`- \`${term}\` — \`${h.file}:${h.line}\`: \`${text}\``);
            }
            if (!found.length) hits.push(`- \`${term}\` — no source contains it`);
        }
        out.push('### Where its terms occur', '', hits.length ? hits.join('\n') : '_It names no code terms._', '');

        const related = relatedOf(r, everywhere, corpus);
        if (related.length) {
            out.push('### Related requirements', '');
            for (const { x, shared } of related)
                out.push(
                    `- ${x.corpus.name} \`${x.requirement.id}\` (\`${x.requirement.file}:${x.requirement.line}\`)${
                        shared.length
                            ? ` — shares ${shared
                                  .slice(0, 4)
                                  .map((t) => `\`${t}\``)
                                  .join(', ')}`
                            : ''
                    }: ${(sentences(x.requirement.statement)[0] ?? '').slice(0, 220)}`,
                );
            out.push('');
        }
    }
    return out.join('\n');
}

/**
 * Balanced parts for parallel readers; same-named capabilities across repositories stay in one part.
 * @param {{ corpus: string, capability: string, file: string, bytes: number, requirementIds: string[] }[]} bundles
 * @param {number} parts
 */
export function partition(bundles, parts) {
    const groups = new Map();
    for (const b of bundles) {
        const key = b.capability.split('/').pop();
        groups.set(key, [...(groups.get(key) ?? []), b]);
    }
    const bins = Array.from({ length: Math.max(1, parts) }, (_, i) => ({
        part: i + 1,
        bytes: 0,
        files: /** @type {string[]} */ ([]),
        capabilities: /** @type {string[]} */ ([]),
        requirementIds: /** @type {string[]} */ ([]),
    }));
    const sorted = [...groups.values()].sort(
        (a, b) => b.reduce((s, x) => s + x.bytes, 0) - a.reduce((s, x) => s + x.bytes, 0),
    );
    for (const group of sorted) {
        const bin = bins.reduce((min, x) => (x.bytes < min.bytes ? x : min));
        for (const b of group) {
            bin.bytes += b.bytes;
            bin.files.push(b.file);
            bin.capabilities.push(`${b.corpus}:${b.capability}`);
            bin.requirementIds.push(...b.requirementIds.map((id) => `${b.corpus}:${id}`));
        }
    }
    return bins.filter((b) => b.files.length);
}
