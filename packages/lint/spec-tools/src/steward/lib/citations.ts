/**
 * Citations of the corpus in the repository's files. A citation is a mention of `openspec/specs/<path>/spec.md`, with
 * or without `#<anchor>`, in a comment, a `{@link}` or `@see` tag, or a Markdown/MDX document. Most citations are
 * optional pointers for a reader, never evidence; the only gate on them is that they resolve. A citation BINDS — is
 * evidence for the scenario it names — only where it sits on a test: inside a `describe`/`it`/`test` call or in the
 * comment run directly above one, on a type assertion of a test file, anywhere in a lint configuration, or anywhere in
 * a file matching a repository `--binds` glob.
 */
import fs from 'node:fs';
import path from 'node:path';

import { listFiles } from './git';
import { blockAt, COMMENT, isCLike, isDoc, lex, testBlocks } from './scan';
import { globToRegExp } from './util';

export type BindingKind = 'test' | 'file';
export type Citation = {
    file: string;
    line: number;
    target: string;
    anchor: string | null;
    kind: 'test' | 'code' | 'doc';
    binding: BindingKind | null;
    resolves: boolean;
    reason?: string;
    testTitle?: string;
    window: [number, number];
};
export type ScanOptions = { files?: string[]; binds?: string[] };

const CITE = /((?:\.{1,2}\/)*(?:[\w@.-]+\/)*?openspec\/specs\/[\w./-]*?spec\.md)(?:#([\w-]+))?/g;
/** Build outputs and vendored copies, the specs themselves, and every change folder (prose that quotes other trees). */
const SKIP =
    /(?:^|\/)(?:node_modules|dist|build|coverage|\.git|\.nx|\.yarn|\.yalc|\.turbo|\.next|\.docusaurus|\.eve)(?:\/|$)|^openspec\/changes\/|(?:^|\/)spec\.md$/;
const TEST_FILE =
    /(?:^|\/)(?:__tests__|e2e)\/|\.(?:test|spec|test-d)\.[cm]?[jt]sx?$|(?:^|\/)test_[^/]+\.py$|_test\.(?:py|go)$/;
/** Lint configurations: a citation anywhere in one binds (a lint rule is the cheapest evidence). */
const LINT_CONFIG = /(?:^|\/)(?:eslint\.config\.[cm]?[jt]s|yarn\.config\.cjs)$/;

export const isTestFile = (file: string) => TEST_FILE.test(file) && !isDoc(file);

export const isLintConfig = (file: string) => LINT_CONFIG.test(file);

/**
 * A mention counts as a citation in a document, in a comment, or in a `{@link …}`/`@see` tag — never in code or a
 * string, where a path is data (a fixture, a constant). C-family files are lexed; every other text file has `#`
 * comments besides the common markers.
 *
 *
 * @param at index of the match in the line
 * @param cls the file's lexer classes, for C-family files
 * @param offset the line's start offset in the file
 */
function citesHere(file: string, line: string, at: number, cls: Uint8Array | null, offset: number) {
    if (isDoc(file)) return true;
    const before = line.slice(0, at);
    if (/\/\/$/.test(before)) return false; // a URL's path, not a repository path
    if (cls) return cls[offset + at] === COMMENT;
    if (/\{@link\s*$/.test(before) || /@see\s+\S*$/.test(before)) return true;
    if (/^\s*(?:\*|\/\*|\/\/|#|<!--)/.test(line)) return true;
    return /(?:^|[^:])\/\/|\/\*|<!--/.test(before) || /(?:^|\s)#/.test(before);
}

/** Anchors a spec file renders, cached per absolute path. */
const anchorCache = new Map();

function anchorsFor(abs: string, anchorsOf: (text: string) => Set<string>) {
    if (!anchorCache.has(abs))
        anchorCache.set(abs, fs.existsSync(abs) ? anchorsOf(fs.readFileSync(abs, 'utf8')) : null);
    return anchorCache.get(abs);
}

/**
 * The files a scan reads: every tracked or untracked-unignored file, or the given ones; null when git cannot list them.
 */
export const scanUniverse = (root: string, { files }: ScanOptions = {}) =>
    (files ?? listFiles(root))?.filter((f) => !SKIP.test(f)) ?? null;

/**
 * Every citation in the repository's text files (a NUL byte marks a binary file).
 *
 * @param anchorsOf renders a spec's anchors
 */
export function scanCitations(
    root: string,
    anchorsOf: (text: string) => Set<string>,
    opts: ScanOptions = {},
): Citation[] {
    anchorCache.clear();
    const binds = (opts.binds ?? []).map(globToRegExp);

    const out: Citation[] = [];
    for (const file of scanUniverse(root, opts) ?? []) {
        let buf;
        try {
            buf = fs.readFileSync(path.join(root, file));
        } catch {
            continue;
        }
        if (buf.indexOf('openspec/specs/') < 0 || buf.includes(0)) continue;
        const text = buf.toString('utf8');
        const lines = text.split('\n');
        const kind = isTestFile(file) ? 'test' : isDoc(file) ? 'doc' : 'code';
        const cls = isCLike(file) ? lex(text) : null;
        const blocks = kind === 'test' ? testBlocks(file, text) : [];
        const wholeFile = isLintConfig(file) || binds.some((re) => re.test(file));
        let offset = 0;
        lines.forEach((line, i) => {
            for (const m of line.matchAll(CITE)) {
                if (!citesHere(file, line, m.index ?? 0, cls, offset)) continue;
                const raw = m[1];
                const rel = raw.startsWith('openspec/') ? raw : path.join(path.dirname(file), raw);
                const target = path.normalize(rel).split(path.sep).join('/');
                const anchors = anchorsFor(path.join(root, target), anchorsOf);
                const anchor = m[2] ?? null;
                let resolves = true;
                let reason;
                if (!anchors) {
                    resolves = false;
                    reason = 'file does not exist';
                } else if (anchor && !anchors.has(anchor)) {
                    resolves = false;
                    reason = `anchor #${anchor} not found`;
                }
                const block = blockAt(blocks, i + 1);

                const binding: BindingKind | null = block ? 'test' : wholeFile ? 'file' : null;
                out.push({
                    file,
                    line: i + 1,
                    target,
                    anchor,
                    kind,
                    binding,
                    resolves,
                    reason,
                    testTitle: block?.title ?? undefined,
                    window: block ? [block.attach, block.end] : [i + 1, Math.min(lines.length, i + 25)],
                });
            }
            offset += line.length + 1;
        });
    }
    return out;
}

/** Citations grouped by `<target>#<anchor>`. */
export function byAnchor(citations: Citation[]) {
    const map: Map<string, Citation[]> = new Map();
    for (const c of citations) {
        if (!c.anchor) continue;
        const key = `${c.target}#${c.anchor}`;
        map.set(key, [...(map.get(key) ?? []), c]);
    }
    return map;
}

/** The anchors a binding citation proves, as `<spec file>#<anchor>`. */
export const boundAnchors = (citations: Citation[]) =>
    new Set(citations.filter((c) => c.binding && c.anchor && c.resolves).map((c) => `${c.target}#${c.anchor}`));
