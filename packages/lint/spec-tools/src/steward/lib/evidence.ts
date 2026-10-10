/**
 * Evidence for an audit, assembled mechanically so a reader judges instead of searching. For every requirement: the
 * tests bound to it and its scenarios, and where its own terms occur in the sources with comments stripped. Code
 * citations are optional pointers, listed when present and never evidence. Every excerpt keeps its file's own line
 * numbers, as one JSON model (`evidence --json`) — what spec-tools assembles each audit's evidence files from.
 */
import fs from 'node:fs';
import path from 'node:path';

import type { Citation } from './citations';
import { isTestFile } from './citations';
import type { Corpus, Requirement } from './corpus';
import { allRequirements } from './corpus';
import { listFiles } from './git';
import { stripComments } from './scan';
import { codeTokens, jaccard, words } from './util';

/** text has its comments blanked; lines are as written */
export type Source = { file: string; text: string; lines: string[] };

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

/** The non-test source files of a repository, read once, comments blanked for searching. */
export function sourceIndex(root: string): Source[] {
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

/** Terms worth searching for: the identifiers a requirement names in backticks. */
export const searchTerms = (r: Requirement) =>
    [...new Set(codeTokens(r.block))].filter(
        (t) => t.length >= 3 && /^[\w$.@/:<>-]+$/.test(t) && !COMMON.has(t.toLowerCase()),
    );

/** A term as a pattern: an identifier-like end never matches inside a longer identifier. */
const termPattern = (term: string) =>
    new RegExp(
        `${/^[\w$]/.test(term) ? '(?<![\\w$])' : ''}${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${/[\w$]$/.test(term) ? '(?![\\w$])' : ''}`,
        'g',
    );

/** Every line of a source the term occurs on, comments stripped. */
export function termHits(term: string, sources: Source[]): { file: string; line: number }[] {
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

/** Requirements sharing terms or wording with `r`, strongest first. */
function relatedOf(r: Requirement, everywhere: { corpus: Corpus; requirement: Requirement }[], corpus: Corpus) {
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

/** The citations of a requirement's anchors. */
function citationsOf(r: Requirement, citations: Citation[]) {
    const anchors = new Set([`${r.file}#${r.slug}`, ...r.scenarios.map((s) => `${r.file}#${s.slug}`)]);
    return citations.filter((c) => c.anchor && c.resolves && anchors.has(`${c.target}#${c.anchor}`));
}

/** The audit's evidence model for one repository, `.spec-audit/evidence.yaml`. */
export function evidenceModel(corpus: Corpus, citations: Citation[], sources: Source[]) {
    const everywhere = allRequirements(corpus).map((requirement) => ({ corpus, requirement }));

    const hitsByTerm: Map<string, { file: string; line: number }[]> = new Map();
    const hitsOf = (term: string) => {
        if (!hitsByTerm.has(term)) hitsByTerm.set(term, termHits(term, sources));
        return hitsByTerm.get(term) as { file: string; line: number }[];
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
