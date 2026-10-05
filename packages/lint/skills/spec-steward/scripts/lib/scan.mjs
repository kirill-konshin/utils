// @ts-check
/**
 * Zero-dependency source reading: which characters of a file are code, comment or string, the extent of every test
 * call and type assertion in a test file, and a file's text with its comments blanked. A call's extent is found by
 * balanced brackets with strings, template literals, regular expressions and comments skipped.
 */

export const CODE = 0;
export const COMMENT = 1;
export const STRING = 2;

/** Files read with the C-family lexer; every other text file has `#` comments. @param {string} file */
export const isCLike = (file) => /\.(?:[cm]?[jt]sx?|go)$/i.test(file);
/** @param {string} file */
export const isDoc = (file) => /\.mdx?$/i.test(file);

const REGEX_AFTER = new Set([...'(,=:[!&|?{};+-*%<>~^', '']);
const REGEX_KEYWORD = /^(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;

/**
 * Classify every character of a C-family source as CODE, COMMENT or STRING. A quoted string never spans a line: an
 * unterminated quote (an apostrophe in JSX text) is read as code.
 * @param {string} text
 * @returns {Uint8Array}
 */
export function lex(text) {
    const n = text.length;
    const cls = new Uint8Array(n);
    const mark = (/** @type {number} */ from, /** @type {number} */ to, /** @type {number} */ k) =>
        cls.fill(k, from, to);

    /** @param {number} from just past the opening backtick @returns {number} just past the closing one */
    const template = (from) => {
        let j = from;
        while (j < n) {
            const ch = text[j];
            if (ch === '\\') {
                mark(j, j + 2, STRING);
                j += 2;
            } else if (ch === '`') {
                cls[j] = STRING;
                return j + 1;
            } else if (ch === '$' && text[j + 1] === '{') {
                mark(j, j + 2, STRING);
                j = code(j + 2, true);
            } else {
                cls[j] = STRING;
                j++;
            }
        }
        return n;
    };

    /** @param {number} from @param {boolean} inTemplate @returns {number} */
    const code = (from, inTemplate) => {
        let j = from;
        let depth = 0;
        let prev = '';
        let word = '';
        while (j < n) {
            const ch = text[j];
            const next = text[j + 1];
            if (ch === '/' && (next === '/' || next === '*')) {
                const e = next === '/' ? text.indexOf('\n', j) : text.indexOf('*/', j + 2);
                const end = e < 0 ? n : next === '/' ? e : e + 2;
                mark(j, end, COMMENT);
                j = end;
                continue;
            }
            if (ch === "'" || ch === '"') {
                let k = j + 1;
                while (k < n && text[k] !== ch && text[k] !== '\n') k += text[k] === '\\' ? 2 : 1;
                if (text[k] === ch) {
                    mark(j, k + 1, STRING);
                    j = k + 1;
                    prev = 'a';
                    word = '';
                } else j++;
                continue;
            }
            if (ch === '`') {
                cls[j] = STRING;
                j = template(j + 1);
                prev = 'a';
                word = '';
                continue;
            }
            if (ch === '/' && (REGEX_AFTER.has(prev) || REGEX_KEYWORD.test(word))) {
                let k = j + 1;
                let inClass = false;
                while (k < n && text[k] !== '\n') {
                    const c = text[k];
                    if (c === '\\') k++;
                    else if (c === '[') inClass = true;
                    else if (c === ']') inClass = false;
                    else if (c === '/' && !inClass) break;
                    k++;
                }
                if (text[k] === '/') {
                    k++;
                    while (k < n && /[a-z]/i.test(text[k])) k++;
                    mark(j, k, STRING);
                    j = k;
                    prev = 'a';
                    word = '';
                    continue;
                }
            }
            if (inTemplate && ch === '{') depth++;
            if (inTemplate && ch === '}') {
                if (depth === 0) {
                    cls[j] = STRING;
                    return j + 1;
                }
                depth--;
            }
            if (/[\w$]/.test(ch)) {
                let k = j;
                while (k < n && /[\w$]/.test(text[k])) k++;
                word = text.slice(j, k);
                prev = 'a';
                j = k;
                continue;
            }
            if (!/\s/.test(ch)) {
                prev = ch;
                word = '';
            }
            j++;
        }
        return n;
    };

    code(0, false);
    return cls;
}

const OPEN = { '(': ')', '[': ']', '{': '}' };

/**
 * The index of the bracket closing the one at `open`, counting code characters only; -1 when it never closes.
 * @param {string} text
 * @param {Uint8Array} cls
 * @param {number} open
 */
export function matchClose(text, cls, open) {
    /** @type {string[]} */
    const stack = [];
    for (let j = open; j < text.length; j++) {
        if (cls[j] !== CODE) continue;
        const ch = text[j];
        if (ch === '(' || ch === '[' || ch === '{') stack.push(OPEN[ch]);
        else if (ch === ')' || ch === ']' || ch === '}') {
            if (stack.pop() !== ch) return -1;
            if (!stack.length) return j;
        }
    }
    return -1;
}

/** The offset each line starts at, and the 1-based line of any offset. @param {string} text */
function lineIndex(text) {
    const starts = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
    const lineOf = (/** @type {number} */ at) => {
        let lo = 0;
        let hi = starts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (starts[mid] <= at) lo = mid;
            else hi = mid - 1;
        }
        return lo + 1;
    };
    return { starts, lineOf };
}

/** @param {string} line */
const indentOf = (line) => /^\s*/.exec(line)?.[0].length ?? 0;

/**
 * @typedef {{ start: number, attach: number, end: number, title: string | null, kind: 'test' | 'type' }} Block
 *   1-based lines: `attach` is the first line of the comment run directly above `start` (or `start` itself).
 */

const TEST_NAME = /(?<![\w$.])(?:describe|it|test|suite|bench)(?![\w$])/g;
/** Chained modifiers a test call may carry: Vitest/Jest (`.only`, `.each(…)`, …) and Playwright (`.describe`, `.step`). */
const TEST_MODIFIERS = new Set([
    ...'only skip concurrent sequential todo each for runIf skipIf fails'.split(' '),
    ...'describe step serial parallel fixme fail'.split(' '),
]);
const TYPE_ASSERTION = /^\s*(?:export\s+)?type\s+([\w$]+)\b[^=]*=\s*Expect\s*</;
const TYPE_CALL = /(?<![\w$.])(?:expectTypeOf|assertType)\s*[(<]/;
const C_COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;

/**
 * The first line of the comment run (for Python, also decorators) directly above a 1-based line, no blank between.
 * @param {string[]} lines
 * @param {number} start
 * @param {RegExp} comment
 */
function attachedAbove(lines, start, comment) {
    let attach = start;
    while (attach > 1 && comment.test(lines[attach - 2])) attach--;
    return attach;
}

/**
 * Where a call that the brackets cannot close ends: the next line at or left of its indent that closes a block.
 * @param {string[]} lines
 * @param {number} start 1-based
 */
function endByIndent(lines, start) {
    const indent = indentOf(lines[start - 1]);
    for (let k = start; k < lines.length; k++)
        if (lines[k].trim() && indentOf(lines[k]) <= indent) return /^\s*[})]/.test(lines[k]) ? k + 1 : -1;
    return -1;
}

/** Test calls and type assertions of a C-family test file. @param {string} text @returns {Block[]} */
function cLikeBlocks(text) {
    const cls = lex(text);
    const { starts, lineOf } = lineIndex(text);
    const lines = text.split('\n');
    /** @type {Block[]} */
    const out = [];
    const skipSpace = (/** @type {number} */ j) => {
        while (j < text.length && (/\s/.test(text[j]) || cls[j] === COMMENT)) j++;
        return j;
    };
    for (const m of text.matchAll(TEST_NAME)) {
        const at = m.index ?? 0;
        if (cls[at] !== CODE) continue;
        let j = at + m[0].length;
        let open = -1;
        let close = -1;
        for (;;) {
            j = skipSpace(j);
            const modifier = text[j] === '.' && /^\.\s*([\w$]+)/.exec(text.slice(j, j + 40));
            if (modifier) {
                if (!TEST_MODIFIERS.has(modifier[1])) break;
                j += modifier[0].length;
            } else if (text[j] === '`' && cls[j] === STRING) {
                j++;
                while (j < text.length && !(text[j] === '`' && cls[j] === STRING)) j++;
                j++;
            } else if (text[j] === '(') {
                const end = matchClose(text, cls, j);
                const after = end < 0 ? -1 : skipSpace(end + 1);
                if (after >= 0 && (text[after] === '(' || text[after] === '`')) {
                    j = after;
                    continue;
                }
                open = j;
                close = end;
                break;
            } else break;
        }
        if (open < 0) continue;
        const start = lineOf(at);
        const end = close >= 0 ? lineOf(close) : endByIndent(lines, start);
        if (end < 0) continue;
        const arg = skipSpace(open + 1);
        const quoted = /^(['"`])((?:\\.|(?!\1)[^\\])*)\1/.exec(text.slice(arg, arg + 400));
        const title = quoted ? quoted[2] : (/^[^,)]+/.exec(text.slice(arg, arg + 200))?.[0].trim() ?? null);
        out.push({ start, attach: attachedAbove(lines, start, C_COMMENT_LINE), end, title, kind: 'test' });
    }
    lines.forEach((line, i) => {
        const alias = TYPE_ASSERTION.exec(line);
        const call = alias ? null : TYPE_CALL.exec(line);
        if (!alias && !call) return;
        if (cls[starts[i] + (call ? call.index : line.search(/\S/))] !== CODE) return;
        let end = i;
        while (end < Math.min(lines.length - 1, i + 60) && !/;\s*(?:\/\/.*)?$/.test(lines[end])) end++;
        const start = i + 1;
        out.push({
            start,
            attach: attachedAbove(lines, start, C_COMMENT_LINE),
            end: end + 1,
            title: alias ? alias[1] : 'expectTypeOf',
            kind: 'type',
        });
    });
    return out;
}

/** Test functions and classes of a Python test file, by indentation. @param {string} text @returns {Block[]} */
function pythonBlocks(text) {
    const lines = text.split('\n');
    /** @type {Block[]} */
    const out = [];
    lines.forEach((line, i) => {
        const m = /^(\s*)(?:async\s+)?def\s+(test_\w+)|^(\s*)class\s+(Test\w*)/.exec(line);
        if (!m) return;
        const indent = (m[1] ?? m[3]).length;
        let end = i;
        for (let k = i + 1; k < lines.length; k++) {
            if (!lines[k].trim() || /^\s*#/.test(lines[k])) continue;
            if (indentOf(lines[k]) <= indent) break;
            end = k;
        }
        const start = i + 1;
        const attach = attachedAbove(lines, start, /^\s*[#@]/);
        out.push({ start, attach, end: end + 1, title: m[2] ?? m[4], kind: 'test' });
    });
    return out;
}

/** Test functions of a Go test file. @param {string} text @returns {Block[]} */
function goBlocks(text) {
    const cls = lex(text);
    const { lineOf } = lineIndex(text);
    const lines = text.split('\n');
    return [...text.matchAll(/^func\s+(Test\w*)\s*\(/gm)].flatMap((m) => {
        const brace = text.indexOf('{', m.index ?? 0);
        const end = brace < 0 ? -1 : matchClose(text, cls, brace);
        if (end < 0) return [];
        const start = lineOf(m.index ?? 0);
        const attach = attachedAbove(lines, start, C_COMMENT_LINE);
        return [{ start, attach, end: lineOf(end), title: m[1], kind: /** @type {const} */ ('test') }];
    });
}

/**
 * Every test call and type assertion of a test file.
 * @param {string} file
 * @param {string} text
 * @returns {Block[]}
 */
export function testBlocks(file, text) {
    if (/\.py$/.test(file)) return pythonBlocks(text);
    if (/\.go$/.test(file)) return goBlocks(text);
    return isCLike(file) ? cLikeBlocks(text) : [];
}

/**
 * The innermost block a 1-based line sits in, or in whose attached comment run it sits.
 * @param {Block[]} blocks
 * @param {number} line
 */
export function blockAt(blocks, line) {
    let best = /** @type {Block | null} */ (null);
    for (const b of blocks)
        if (b.attach <= line && line <= b.end && (!best || b.end - b.attach < best.end - best.attach)) best = b;
    return best;
}

/**
 * A source's text with its comments blanked to spaces, line breaks kept, so a term search finds code, not prose.
 * @param {string} file
 * @param {string} text
 */
export function stripComments(file, text) {
    if (/\.json$/i.test(file)) return text;
    if (!isCLike(file))
        return text
            .split('\n')
            .map((l) => l.replace(/(^|\s)#.*$/, '$1'))
            .join('\n');
    const cls = lex(text);
    const chars = text.split('');
    for (let i = 0; i < chars.length; i++) if (cls[i] === COMMENT && chars[i] !== '\n') chars[i] = ' ';
    return chars.join('');
}
