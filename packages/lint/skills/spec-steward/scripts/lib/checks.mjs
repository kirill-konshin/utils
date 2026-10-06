// @ts-check
/**
 * Deterministic checks over the corpus, a diff of it, and the citations of it. Every kind is cheap and mechanical;
 * judgement stays with the reader. Severity: `error` fails the run, `warn` fails it under --strict, `info` is a prompt
 * that never fails. Under a base, prompts are limited to what the diff added or edited.
 */
import fs from 'node:fs';
import path from 'node:path';

import { boundAnchors } from './citations.mjs';
import { ADVISORY, allRequirements, DEFAULT_MARKERS, gapExempts, KNOWN_GAP, RETIRED } from './corpus.mjs';
import {
    absolutesIn,
    codeTokens,
    containment,
    exceptionsIn,
    jaccard,
    normalize,
    sentences,
    wordCount,
    words,
} from './util.mjs';

export { DEFAULT_MARKERS };

/**
 * @typedef {import('./corpus.mjs').Corpus} Corpus
 * @typedef {import('./corpus.mjs').Requirement} Requirement
 * @typedef {import('./corpus.mjs').Scenario} Scenario
 * @typedef {import('./citations.mjs').Citation} Citation
 * @typedef {'error' | 'warn' | 'info'} Severity
 * @typedef {{
 *   kind: string, severity: Severity, file: string, line: number, id?: string, scenario?: string, message: string,
 *   fix?: { file: string, from: string, to: string, all?: boolean }[]
 * }} Finding
 * @typedef {{ reqBlocks: Set<string>, scenarioBlocks: Set<string> }} BaseIndex
 * @typedef {{
 *   maxWords?: [number, number], maxObligations?: [number, number], files?: Set<string>, base?: BaseIndex | null
 * }} CheckOptions
 */

/** The size lines: [prompt, failing] for a block's words and a statement's obligations. */
export const SIZE = {
    words: /** @type {[number, number]} */ ([300, 500]),
    obligations: /** @type {[number, number]} */ ([5, 8]),
};
/** The kinds that need a base, skipped when there is none. */
export const DIFF_KINDS = ['weakened', 'new-requirement', 'renamed-anchor', 'scenario-unproven', 'non-ears', 'non-bdd'];

const VAGUE =
    /\b(appropriate(?:ly)?|reasonabl[ey]|sensibl[ey]|cleanly|lean|simplest|properly|efficient(?:ly)?|minimal(?:ly)?|best|prefer(?:s|ably|red)?|as needed|where possible|if possible|generally|typically|ideally|robust(?:ly)?|gracefully|user-friendly|well-defined|readable|maintainable|elegant(?:ly)?|badly|good)\b/i;
const FILE_PATH = /(?<![\w/:])(?:[\w@.-]+\/)+[\w.-]+\.(?:[cm]?[jt]sx?|json|ya?ml|sh|py|go|sql|toml|conf)\b/g;
const CALL_SYMBOL = /^(?:[a-z][\w$]*\.)*[a-z][\w$]*\(\)$/;
const CLASS_SYMBOL =
    /^[A-Z][a-zA-Z0-9]+(?:Service|Controller|Module|Provider|Factory|Middleware|Repository|Helper|Manager|Adapter|Handler|Builder|Utils?)$/;
const READS =
    /\b(?:readFileSync|readFile|readdirSync|readJson(?:Sync)?|globSync|fs\.promises\.readFile|Bun\.file)\s*\(/;
const READ_TARGET =
    /['"`][^'"`\n]*(?:\.(?:[cm]?[jt]sx?|mdx?|ya?ml|json)|package\.json|AGENTS\.md|SKILL\.md|\/src|src\/)['"`]/;
const FIXTURE = /fixture|__fixtures__|testdata|test-data/i;
const TEXT_ASSERT =
    /\.(?:toContain|toMatch|toMatchInlineSnapshot|toMatchSnapshot|toInclude)\(|\.includes\(|\.match\(|new RegExp\(|\/[^/\n]{2,}\/[gimsuy]*\.test\(/;
const OBLIGATION = /\b(?:MUST|SHALL|REQUIRED|SHOULD|RECOMMENDED|MAY|OPTIONAL)\b/;
const EARS = /^(?:When|While|Where)\b|^If\b[\s\S]*\bthen\b|\bSHALL\b/;
const EARS_FORMS =
    'When <trigger>, the <system> SHALL <response>; While <state>, …; If <condition>, then …; Where <feature>, …; or The <system> SHALL …';

/** @param {Corpus} corpus */
const reqIndex = (corpus) => new Map(allRequirements(corpus).map((r) => [r.id, r]));
/** Body without its heading, normalized: identity apart from name. @param {string} block */
const bodyKey = (block) => normalize(block.split('\n').slice(1).join('\n'));

/**
 * What the base corpus holds, for telling added or edited text from text it already had (a verbatim move is neither).
 * @param {Corpus} base
 * @returns {BaseIndex}
 */
export function baseIndex(base) {
    const reqs = allRequirements(base);
    return {
        reqBlocks: new Set(reqs.map((r) => normalize(r.block))),
        scenarioBlocks: new Set(reqs.flatMap((r) => r.scenarios.map((s) => normalize(s.block)))),
    };
}

/**
 * Compare a base corpus with the head: removals, weaker obligations, dropped absolutes, added exceptions, new advisory
 * markers — and renames (same body, new heading or file), which are not weakening but move every anchor citing them.
 * @param {Corpus} base
 * @param {Corpus} head
 * @returns {{ findings: Finding[], renames: { from: string, to: string }[] }}
 */
export function diffCorpus(base, head) {
    /** @type {Finding[]} */
    const findings = [];
    const renames = [];
    const b = reqIndex(base);
    const h = reqIndex(head);
    const headByBody = new Map([...h.values()].map((r) => [bodyKey(r.block), r]));
    const renamedTo = new Set();

    for (const [id, old] of b) {
        const now = h.get(id);
        if (!now) {
            const moved = headByBody.get(bodyKey(old.block));
            if (moved && !b.has(moved.id)) {
                renamedTo.add(moved.id);
                renames.push({ from: `${old.file}#${old.slug}`, to: `${moved.file}#${moved.slug}` });
                continue;
            }
            findings.push({
                kind: 'weakened',
                severity: 'warn',
                file: old.file,
                line: old.line,
                id,
                message: `requirement removed: "${old.name}" — never delete a rule to make code pass; the owner decides`,
            });
            continue;
        }
        const nowScen = new Map(now.scenarios.map((s) => [s.slug, s]));
        const nowScenBody = new Map(now.scenarios.map((s) => [bodyKey(s.block), s]));
        for (const s of old.scenarios) {
            if (nowScen.has(s.slug)) continue;
            const moved = nowScenBody.get(bodyKey(s.block));
            if (moved) {
                renames.push({ from: `${old.file}#${s.slug}`, to: `${now.file}#${moved.slug}` });
                continue;
            }
            findings.push({
                kind: 'weakened',
                severity: 'warn',
                file: now.file,
                line: now.line,
                id,
                message: `scenario removed: "${s.name}"`,
            });
        }
        /** @type {string[]} */
        const why = [];
        if (now.strong < old.strong) why.push(`MUST/SHALL ${old.strong} → ${now.strong}`);
        const absOld = absolutesIn(old.statement).length;
        const absNow = absolutesIn(now.statement).length;
        if (absNow < absOld) why.push(`absolutes ${absOld} → ${absNow}`);
        const exOld = exceptionsIn(old.block).length;
        const exNow = exceptionsIn(now.block).length;
        if (exNow > exOld) why.push(`exceptions ${exOld} → ${exNow}`);
        if (now.advisory && !old.advisory) why.push('newly marked advisory');
        if (why.length)
            findings.push({
                kind: 'weakened',
                severity: 'warn',
                file: now.file,
                line: now.line,
                id,
                message: `"${now.name}": ${why.join(', ')} — weakening a rule needs the owner's word, never done to make code pass`,
            });
    }
    for (const [id, r] of h) {
        if (b.has(id) || renamedTo.has(id)) continue;
        findings.push({
            kind: 'new-requirement',
            severity: 'info',
            file: r.file,
            line: r.line,
            id,
            message: `new requirement "${r.name}": name the observable failure it prevents and the cheapest evidence that catches it (types > lint/static > behavioural test > integration > review); if there is none it is advisory or belongs elsewhere (see the steward model)`,
        });
    }
    return { findings, renames };
}

/**
 * The marker findings of one requirement: retired, tracker-less, misplaced or misspelled markers grant nothing until
 * they are fixed, and say so.
 * @param {Requirement} r
 * @returns {Finding[]}
 */
function markerFindings(r) {
    /** @type {Finding[]} */
    const out = [];
    const warn = (/** @type {number} */ line, /** @type {string} */ message, /** @type {any} */ fix) =>
        out.push({
            kind: 'marker-hygiene',
            severity: 'warn',
            file: r.file,
            line,
            id: r.id,
            message,
            ...(fix && { fix }),
        });
    for (const m of r.markers) {
        if (m.inline) warn(m.line, `a ${m.label} marker inside a line is not read — put it on a line of its own`);
        else if (m.label === RETIRED)
            warn(
                m.line,
                `**⚠️ Unenforced:** is retired and grants nothing — reclassify it: ${DEFAULT_MARKERS[0]} (review is its evidence), ${DEFAULT_MARKERS[1]} (behaviour or its evidence is missing), or no marker (a test, lint or build proves it)`,
            );
        else if (m.label === KNOWN_GAP && !m.tracker)
            warn(m.line, `a Known gap names its tracker — ${DEFAULT_MARKERS[1]}; without one it grants nothing`);
        else if (m.label === ADVISORY && m.scenario)
            warn(
                m.line,
                "Advisory is the requirement's class — put it directly under the requirement heading; in a scenario it grants nothing",
            );
        else if (m.label === KNOWN_GAP && m.scenario)
            warn(
                m.line,
                'a Known gap goes under the requirement statement and names the scenarios it exempts by title; inside a scenario it grants nothing',
            );
        else {
            const canon = m.label === ADVISORY ? DEFAULT_MARKERS[0] : `**⚠️ Known gap (${m.tracker}):**`;
            if (!m.text.startsWith(canon)) {
                const fixed = m.text.replace(/^\s*\*\*[^*]*\*\*(?:\s*:)?/u, canon);
                warn(m.line, `marker should read ${canon}`, [{ file: r.file, from: m.text, to: fixed }]);
            }
        }
    }
    for (const g of r.gaps)
        if (g.named && !g.exempts.length)
            warn(
                g.line,
                'names no scenario of this requirement by its title — a Known gap exempts only the scenarios it names',
            );
    return out;
}

/**
 * Checks over one corpus and its citations.
 * @param {Corpus} corpus
 * @param {Citation[]} citations
 * @param {CheckOptions} opts
 * @returns {Finding[]}
 */
export function checkCorpus(corpus, citations, opts = {}) {
    /** @type {Finding[]} */
    const out = [];
    const [wordsInfo, wordsFail] = opts.maxWords ?? SIZE.words;
    const [obligationsInfo, obligationsFail] = opts.maxObligations ?? SIZE.obligations;
    const bound = boundAnchors(citations);
    const inScope = (/** @type {string} */ f) => !opts.files || opts.files.has(f);
    const base = opts.base ?? null;

    for (const cap of corpus.capabilities) {
        if (!inScope(cap.file)) continue;
        for (const d of cap.duplicates)
            out.push({
                kind: 'duplicate-anchor',
                severity: 'error',
                file: cap.file,
                line: d.line,
                message: `renders #${d.slug} as line ${d.first} does — a citation reaches only the first; rename one`,
            });
        for (const r of cap.requirements) {
            const at = (/** @type {number} */ line, /** @type {Scenario | undefined} */ s = undefined) => ({
                file: r.file,
                line,
                id: r.id,
                ...(s && { scenario: s.slug }),
            });
            const stmtWords = words(r.statement);
            const binds = (/** @type {Scenario} */ s) =>
                bound.has(`${r.file}#${s.slug}`) || (r.scenarios.length === 1 && bound.has(`${r.file}#${r.slug}`));

            const paths = [...r.block.matchAll(FILE_PATH)].map((m) => m[0]).filter((p) => !p.includes('openspec/'));
            const symbols = codeTokens(r.block).filter((t) => CALL_SYMBOL.test(t) || CLASS_SYMBOL.test(t));
            if (paths.length || symbols.length)
                out.push({
                    kind: 'impl-detail',
                    severity: 'info',
                    ...at(r.line),
                    message: `names ${[...new Set([...paths, ...symbols])].slice(0, 6).join(', ')} — would it survive a rewrite that keeps the contract? If not, it is not spec text`,
                });

            const obligationSentences = sentences(r.statement).filter((s) => OBLIGATION.test(s));
            for (const s of obligationSentences) {
                if (!/\b(MUST|SHALL|REQUIRED)\b/.test(s)) continue;
                const v = VAGUE.exec(s);
                if (v)
                    out.push({
                        kind: 'vague-obligation',
                        severity: 'info',
                        ...at(r.statementLine),
                        message: `"${v[0]}" inside an obligation — no test can fail on it; a candidate for advisory`,
                    });
            }

            const abs = absolutesIn(r.statement);
            const anyBound =
                bound.has(`${r.file}#${r.slug}`) || r.scenarios.some((s) => bound.has(`${r.file}#${s.slug}`));
            if (!r.advisory && abs.length && !exceptionsIn(r.statement).length && !anyBound)
                out.push({
                    kind: 'absolute-unproven',
                    severity: 'info',
                    ...at(r.line),
                    message: `absolute (${[...new Set(abs)].join(', ')}) with no named exception and nothing binding it — name its exceptions, or say there are none, for the owner's review`,
                });

            for (const s of r.scenarios) {
                const sw = words(s.steps.map((x) => x.text).join(' '));
                if (sw.length >= 3 && containment(sw, stmtWords) >= 0.85)
                    out.push({
                        kind: 'restating-scenario',
                        severity: 'info',
                        ...at(s.line, s),
                        message: `scenario "${s.name}" restates the requirement — it adds no precision`,
                    });
                if (base && (!s.steps.some((x) => x.kw === 'WHEN') || !s.steps.some((x) => x.kw === 'THEN')))
                    out.push({
                        kind: 'non-bdd',
                        severity: 'info',
                        ...at(s.line, s),
                        message: `scenario "${s.name}" lacks WHEN/THEN steps — Given/When/Then, Given only where a precondition matters`,
                    });
                if (
                    base &&
                    !r.advisory &&
                    !base.scenarioBlocks.has(normalize(s.block)) &&
                    !binds(s) &&
                    !gapExempts(r, s)
                )
                    out.push({
                        kind: 'scenario-unproven',
                        severity: 'error',
                        ...at(s.line, s),
                        message: `scenario "${s.name}" is new or changed in a REQUIRED requirement and nothing binds it — cite #${s.slug} on the test block, type assertion or lint entry that proves it, or name it in a ${DEFAULT_MARKERS[1]} line`,
                    });
            }
            for (let i = 0; i < r.scenarios.length; i++)
                for (let j = i + 1; j < r.scenarios.length; j++) {
                    const a = words(r.scenarios[i].block.split('\n').slice(1).join(' '));
                    const bb = words(r.scenarios[j].block.split('\n').slice(1).join(' '));
                    if (a.length >= 4 && jaccard(a, bb) >= 0.9)
                        out.push({
                            kind: 'duplicate-scenario',
                            severity: 'info',
                            ...at(r.scenarios[j].line, r.scenarios[j]),
                            message: `"${r.scenarios[j].name}" repeats "${r.scenarios[i].name}"`,
                        });
                }

            const w = wordCount(r.block);
            const o = r.strong + r.weak;
            if (w > wordsInfo)
                out.push({
                    kind: 'size',
                    severity: w > wordsFail ? 'error' : 'info',
                    ...at(r.line),
                    message:
                        w > wordsFail
                            ? `${w} words (> ${wordsFail}) — over the failing line: split it into coherent areas that fit under it`
                            : `${w} words (> ${wordsInfo})`,
                });
            if (o > obligationsInfo)
                out.push({
                    kind: 'size',
                    severity: o > obligationsFail ? 'error' : 'info',
                    ...at(r.line),
                    message:
                        o > obligationsFail
                            ? `${o} obligations in the statement (> ${obligationsFail}) — over the failing line: move the detail into scenarios`
                            : `${o} obligations in the statement (> ${obligationsInfo})`,
                });
            if (base && !obligationSentences.length)
                out.push({
                    kind: 'non-ears',
                    severity: 'info',
                    ...at(r.line),
                    message: `the statement issues no obligation — EARS: ${EARS_FORMS}`,
                });
            else if (base && !EARS.test(obligationSentences[0]))
                out.push({
                    kind: 'non-ears',
                    severity: 'info',
                    ...at(r.line),
                    message: `its first obligation matches no EARS template — ${EARS_FORMS}`,
                });

            out.push(...markerFindings(r));
        }
    }

    out.push(...duplicateRequirements(corpus).filter((f) => inScope(f.file)));
    out.push(...citationFindings(corpus, citations, inScope));
    return out;
}

/**
 * The same requirement name in two capabilities, or two requirements with the same body up to whitespace.
 * @param {Corpus} corpus
 * @returns {Finding[]}
 */
function duplicateRequirements(corpus) {
    /** @type {Finding[]} */
    const out = [];
    /** @type {Map<string, Requirement[]>} */
    const byName = new Map();
    /** @type {Map<string, Requirement[]>} */
    const byBody = new Map();
    for (const r of allRequirements(corpus)) {
        const name = r.name.toLowerCase();
        byName.set(name, [...(byName.get(name) ?? []), r]);
        const body = bodyKey(r.block);
        if (body) byBody.set(body, [...(byBody.get(body) ?? []), r]);
    }
    for (const group of byName.values()) {
        if (new Set(group.map((r) => r.capability)).size < 2) continue;
        for (const r of group.slice(1))
            out.push({
                kind: 'duplicate-requirement',
                severity: 'error',
                file: r.file,
                line: r.line,
                id: r.id,
                message: `"${r.name}" is also a requirement of ${group[0].capability} — one rule, one home`,
            });
    }
    for (const group of byBody.values())
        for (const r of group.slice(1))
            out.push({
                kind: 'duplicate-requirement',
                severity: 'error',
                file: r.file,
                line: r.line,
                id: r.id,
                message: `same text as ${group[0].id} (${group[0].file}:${group[0].line})`,
            });
    return out;
}

/**
 * Citations that do not resolve, tests that assert on text, and bindings that do not seem to prove what they cite.
 * @param {Corpus} corpus
 * @param {Citation[]} citations
 * @param {(file: string) => boolean} inScope
 * @returns {Finding[]}
 */
function citationFindings(corpus, citations, inScope) {
    /** @type {Finding[]} */
    const out = [];
    const reqs = allRequirements(corpus);
    /** @type {Map<string, Requirement>} */
    const byScenario = new Map();
    for (const r of reqs) for (const s of r.scenarios) byScenario.set(`${r.file}#${s.slug}`, r);
    const reqByAnchor = new Map(reqs.map((r) => [`${r.file}#${r.slug}`, r]));

    /** @type {Map<string, Citation[]>} */
    const testsByFile = new Map();
    for (const c of citations) {
        if (!inScope(c.file)) continue;
        if (!c.resolves)
            out.push({
                kind: 'dangling-citation',
                severity: 'error',
                file: c.file,
                line: c.line,
                message: `${c.target}${c.anchor ? `#${c.anchor}` : ''}: ${c.reason}`,
            });
        if (c.kind === 'test') testsByFile.set(c.file, [...(testsByFile.get(c.file) ?? []), c]);
    }

    for (const [file, cites] of testsByFile) {
        const abs = path.join(corpus.path, file);
        if (!fs.existsSync(abs)) continue;
        const text = fs.readFileSync(abs, 'utf8');
        if (READS.test(text) && READ_TARGET.test(text) && TEXT_ASSERT.test(text)) {
            const targets = [...text.matchAll(new RegExp(READ_TARGET.source, 'g'))]
                .map((m) => m[0])
                .filter((t) => !FIXTURE.test(t));
            if (targets.length)
                out.push({
                    kind: 'textual-test',
                    severity: 'warn',
                    file,
                    line: cites[0].line,
                    message: `reads ${[...new Set(targets)].slice(0, 4).join(', ')} and asserts on text — that proves text is present, not behaviour; prefer a behavioural test, or a lint/dependency rule for structure`,
                });
        }
    }

    const linesOf = new Map();
    for (const c of citations) {
        if (!inScope(c.file) || !c.binding || !c.resolves || !c.anchor) continue;
        const key = `${c.target}#${c.anchor}`;
        const req = reqByAnchor.get(key);
        if (req && req.scenarios.length > 1) {
            out.push({
                kind: 'unbound-test',
                severity: 'info',
                file: c.file,
                line: c.line,
                message: `cites the requirement "${req.name}", not the scenario it proves — a requirement anchor binds only a requirement's one scenario`,
            });
            continue;
        }
        if (c.binding !== 'test') continue;
        const owner = byScenario.get(key);
        const scen = owner?.scenarios.find((s) => `${owner.file}#${s.slug}` === key);
        if (!scen) continue;
        const terms = codeTokens(scen.block).filter((t) => t.length >= 3 && !/\s/.test(t));
        if (!terms.length) continue;
        if (!linesOf.has(c.file))
            linesOf.set(c.file, fs.readFileSync(path.join(corpus.path, c.file), 'utf8').split('\n'));
        const body = linesOf
            .get(c.file)
            .slice(c.window[0] - 1, c.window[1])
            .join('\n');
        if (!terms.some((t) => body.includes(t)))
            out.push({
                kind: 'unbound-test',
                severity: 'info',
                file: c.file,
                line: c.line,
                message: `cites "${scen.name}" but mentions none of its terms (${terms.slice(0, 4).join(', ')}) — does it exercise it?`,
            });
    }
    return out;
}

/**
 * Prompts limited to what the diff added or edited: a requirement or scenario whose text the base holds nowhere, and
 * citations in changed files. Errors and warnings stay corpus-wide.
 * @param {Finding[]} findings
 * @param {Corpus} head
 * @param {BaseIndex} base
 * @param {Set<string>} changed files the working tree changes against the base
 */
export function scopePrompts(findings, head, base, changed) {
    const edited = new Set();
    for (const r of allRequirements(head)) {
        if (!base.reqBlocks.has(normalize(r.block))) edited.add(r.id);
        for (const s of r.scenarios) if (!base.scenarioBlocks.has(normalize(s.block))) edited.add(`${r.id}|${s.slug}`);
    }
    return findings.filter(
        (f) =>
            f.severity !== 'info' ||
            (f.id ? edited.has(f.scenario ? `${f.id}|${f.scenario}` : f.id) : changed.has(f.file)),
    );
}

/**
 * Fixes for anchors a diff renamed: every citation of the old anchor is rewritten to the new one.
 * @param {{ from: string, to: string }[]} renames
 * @param {Citation[]} citations
 * @returns {Finding[]}
 */
export function renameFindings(renames, citations) {
    /** @type {Finding[]} */
    const out = [];
    for (const { from, to } of renames) {
        const hits = citations.filter((c) => c.anchor && `${c.target}#${c.anchor}` === from);
        for (const c of hits)
            out.push({
                kind: 'renamed-anchor',
                severity: 'error',
                file: c.file,
                line: c.line,
                message: `cites ${from}, renamed to ${to}`,
                fix: [{ file: c.file, from, to, all: true }],
            });
    }
    return out;
}

/**
 * Apply every finding's fix; each file is rewritten once. A rename replaces whole anchors only (`#x` never `#x-y`).
 * @param {string} root
 * @param {Finding[]} findings
 * @returns {string[]} files changed
 */
export function applyFixes(root, findings) {
    /** @type {Map<string, string>} */
    const texts = new Map();
    for (const f of findings)
        for (const fix of f.fix ?? []) {
            const abs = path.join(root, fix.file);
            const text = texts.get(abs) ?? fs.readFileSync(abs, 'utf8');
            const whole = new RegExp(`${fix.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'g');
            texts.set(abs, fix.all ? text.replace(whole, () => fix.to) : text.replace(fix.from, () => fix.to));
        }
    const changed = [];
    for (const [abs, text] of texts) {
        if (fs.readFileSync(abs, 'utf8') !== text) {
            fs.writeFileSync(abs, text);
            changed.push(path.relative(root, abs));
        }
    }
    return changed;
}
