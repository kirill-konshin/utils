// @ts-check
/** Text helpers shared by every steward command: slugs, tokens, RFC 2119 keywords, absolutes. */

/**
 * GitHub/Docusaurus heading slug (github-slugger semantics): lowercase, drop punctuation and symbols, every space
 * becomes a hyphen (runs are NOT collapsed, so `a — b` is `a--b`). `seen` makes repeats unique the way a rendered
 * page does (`x`, `x-1`, `x-2`).
 *
 * @param {string} heading
 * @param {Map<string, number>} [seen]
 */
export function slugify(heading, seen) {
    const base = heading
        .toLowerCase()
        .trim()
        .replace(/[^\p{L}\p{N}\p{M}\p{Pc} -]/gu, '')
        .replace(/ /g, '-');
    if (!seen) return base;
    let slug = base;
    while (seen.has(slug)) {
        const next = (seen.get(base) ?? 0) + 1;
        seen.set(base, next);
        slug = `${base}-${next}`;
    }
    seen.set(slug, 0);
    return slug;
}

/** Inline code spans removed: a keyword in backticks is mentioned, not issued. @param {string} text */
export const stripCode = (text) => text.replace(/`[^`\n]*`/g, ' ');

/** Whitespace-normalized text, for comparing blocks regardless of wrapping. @param {string} text */
export const normalize = (text) => text.replace(/\s+/g, ' ').trim();

/** The RFC 2119 keywords, a NOT form counted once (NEVER and ALWAYS are not among them). */
export const STRONG = /\b(MUST NOT|MUST|SHALL NOT|SHALL|REQUIRED)\b/g;
export const WEAK = /\b(SHOULD NOT|SHOULD|RECOMMENDED|MAY|OPTIONAL)\b/g;

/** @param {string} text */
export const strongCount = (text) => (stripCode(text).match(STRONG) ?? []).length;
/** @param {string} text */
export const weakCount = (text) => (stripCode(text).match(WEAK) ?? []).length;

export const ABSOLUTE = /\b(never|always|only|every|all|none|no|any)\b/gi;
export const EXCEPTION =
    /\b(except|unless|where possible|if possible|when feasible|as appropriate|otherwise|instead)\b/gi;

/** Sentences of a block, split on terminal punctuation or list bullets. @param {string} text */
export const sentences = (text) =>
    stripCode(text)
        .split(/(?<=[.!?])\s+|\n\s*[-*]\s+|\n{2,}/)
        .map((s) => s.trim())
        .filter(Boolean);

/** Absolutes issued inside obligation sentences (an absolute in plain prose obliges nothing). @param {string} text */
export const absolutesIn = (text) =>
    sentences(text)
        .filter((s) => /\b(MUST|SHALL|REQUIRED)\b/.test(s))
        .flatMap((s) => (s.match(ABSOLUTE) ?? []).map((w) => w.toLowerCase()));

/** @param {string} text */
export const exceptionsIn = (text) => (stripCode(text).match(EXCEPTION) ?? []).map((w) => w.toLowerCase());

const STOP = new Set(
    'the a an and or of to in on for with by from at as is are be been was were it its this that these those when then which who what where while if else not no any all each every one two than into onto via per their there them they his her our your can may must shall should will would could does do did has have had only also more most less such same other another so but nor yet very just over under between within without about after before during because both either neither'.split(
        ' ',
    ),
);

/** Content words (lowercase, ≥ 4 letters, no stopwords). @param {string} text */
export const words = (text) =>
    (
        stripCode(text)
            .toLowerCase()
            .match(/[\p{L}][\p{L}\p{N}_-]{3,}/gu) ?? []
    )
        .filter((w) => !STOP.has(w))
        .map((w) => (w.length > 4 ? w.replace(/(?:ing|ed|es|s)$/, '') : w));

/** Backticked terms — the identifiers a requirement names. @param {string} text */
export const codeTokens = (text) => [...text.matchAll(/`([^`\n]{2,80})`/g)].map((m) => m[1].trim());

/** Share of `a`'s distinct words that also occur in `b`. @param {string[]} a @param {string[]} b */
export const containment = (a, b) => {
    const sa = new Set(a);
    if (!sa.size) return 0;
    const sb = new Set(b);
    let hit = 0;
    for (const w of sa) if (sb.has(w)) hit++;
    return hit / sa.size;
};

/** Jaccard similarity of two word lists. @param {string[]} a @param {string[]} b */
export const jaccard = (a, b) => {
    const sa = new Set(a);
    const sb = new Set(b);
    if (!sa.size && !sb.size) return 1;
    let inter = 0;
    for (const w of sa) if (sb.has(w)) inter++;
    return inter / (sa.size + sb.size - inter);
};

/** Word count of a block. @param {string} text */
export const wordCount = (text) => (text.match(/\S+/g) ?? []).length;

/**
 * Minimal argv parser: `--key value`, `--key=value`, `--flag`, repeated keys collect into arrays. A key listed in
 * `booleans` never takes the next argument as its value.
 * @param {string[]} argv
 * @param {string[]} [repeatable]
 * @param {string[]} [booleans]
 */
export function parseArgs(argv, repeatable = [], booleans = []) {
    /** @type {Record<string, any>} */
    const opts = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith('--')) {
            opts._.push(arg);
            continue;
        }
        const eq = arg.indexOf('=');
        const key = eq > 0 ? arg.slice(2, eq) : arg.slice(2);
        let value = eq > 0 ? arg.slice(eq + 1) : true;
        if (value === true && !booleans.includes(key) && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--'))
            value = argv[++i];
        if (repeatable.includes(key)) (opts[key] ??= []).push(value);
        else opts[key] = value;
    }
    return opts;
}

/** @param {string} s */
const escapeRe = (s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&');

/**
 * A repository-relative glob as a RegExp: `**` spans directories, `*` and `?` stay inside one, `{a,b}` alternates.
 * @param {string} glob
 */
export function globToRegExp(glob) {
    let re = '';
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        const end = c === '{' ? glob.indexOf('}', i) : -1;
        if (c === '*' && glob[i + 1] === '*') {
            const slash = glob[i + 2] === '/';
            re += slash ? '(?:.*/)?' : '.*';
            i += slash ? 2 : 1;
        } else if (c === '*') re += '[^/]*';
        else if (c === '?') re += '[^/]';
        else if (end > i) {
            re += `(?:${glob
                .slice(i + 1, end)
                .split(',')
                .map(escapeRe)
                .join('|')})`;
            i = end;
        } else re += escapeRe(c);
    }
    return new RegExp(`^${re}$`);
}
