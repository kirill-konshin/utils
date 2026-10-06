// @ts-check
/**
 * Rules shared by several repositories, compared: capabilities pair by path or by leaf name, requirements by anchor or
 * by statement. A rule is its name and statement; its scenarios are each repository's own, so a scenario only one
 * repository has is not drift. Reports identical, drifted and one-sided rules; choosing the wording stays with the owner.
 */
import { loadCorpus } from './corpus.mjs';
import { jaccard, normalize, words } from './util.mjs';

/**
 * @typedef {import('./corpus.mjs').Corpus} Corpus
 * @typedef {import('./corpus.mjs').Requirement} Requirement
 */

/** The rule's own words: its statement, without its markers and scenarios, normalized. @param {Requirement} r */
const statement = (r) => normalize(r.statement);

/**
 * Word-level difference of two texts: the words only one side has, in order.
 * @param {string} a
 * @param {string} b
 */
export function wordDiff(a, b) {
    const wa = normalize(a).split(' ');
    const wb = normalize(b).split(' ');
    const sa = new Set(wa);
    const sb = new Set(wb);
    return { onlyA: wa.filter((w) => !sb.has(w)).join(' '), onlyB: wb.filter((w) => !sa.has(w)).join(' ') };
}

/**
 * @param {Corpus} a
 * @param {Corpus} b
 */
export function align(a, b) {
    const pairs = [];
    const leaf = (/** @type {string} */ c) => c.split('/').pop();
    for (const ca of a.capabilities) {
        const cb =
            b.capabilities.find((x) => x.capability === ca.capability) ??
            b.capabilities.find((x) => leaf(x.capability) === leaf(ca.capability));
        if (!cb) continue;
        const used = new Set();
        const reqs = [];
        for (const ra of ca.requirements) {
            let rb = cb.requirements.find((x) => x.slug === ra.slug && !used.has(x.slug));
            if (!rb) {
                const best = cb.requirements
                    .filter((x) => !used.has(x.slug))
                    .map((x) => ({ x, s: jaccard(words(ra.statement), words(x.statement)) }))
                    .sort((p, q) => q.s - p.s)[0];
                if (best && best.s >= 0.5) rb = best.x;
            }
            if (!rb) {
                reqs.push({ kind: 'only-a', a: ra });
                continue;
            }
            used.add(rb.slug);
            const same = statement(ra) === statement(rb) && ra.name === rb.name;
            reqs.push({
                kind: same ? 'identical' : 'drift',
                a: ra,
                b: rb,
                ...(same ? {} : wordDiff(ra.statement, rb.statement)),
            });
        }
        for (const rb of cb.requirements) if (!used.has(rb.slug)) reqs.push({ kind: 'only-b', b: rb });
        pairs.push({ a: ca.capability, b: cb.capability, requirements: reqs });
    }
    return pairs;
}

/**
 * @param {Record<string, any>} opts
 * @param {{ name: string, path: string, specsDir: string }[]} roots
 */
export function alignCli(opts, roots) {
    if (roots.length < 2) {
        process.stderr.write('align needs two --root NAME=path\n');
        return 2;
    }
    const [ra, rb] = roots;
    const pairs = align(loadCorpus(ra.path, ra), loadCorpus(rb.path, rb));
    if (opts.json) {
        process.stdout.write(
            JSON.stringify(
                pairs.map((p) => ({
                    ...p,
                    requirements: p.requirements.map((r) => ({
                        kind: r.kind,
                        a: r.a && `${r.a.file}:${r.a.line} ${r.a.name}`,
                        b: r.b && `${r.b.file}:${r.b.line} ${r.b.name}`,
                        onlyA: r.onlyA,
                        onlyB: r.onlyB,
                    })),
                })),
                null,
                2,
            ) + '\n',
        );
        return 0;
    }
    let drift = 0;
    for (const p of pairs) {
        const count = (/** @type {string} */ k) => p.requirements.filter((r) => r.kind === k).length;
        process.stdout.write(
            `\n${ra.name}:${p.a} ↔ ${rb.name}:${p.b} — identical ${count('identical')}, drift ${count('drift')}, only ${ra.name} ${count('only-a')}, only ${rb.name} ${count('only-b')}\n`,
        );
        for (const r of p.requirements) {
            if (r.kind === 'identical') continue;
            if (r.kind === 'drift') {
                drift++;
                process.stdout.write(
                    `  drift  ${ra.name} ${r.a?.file}:${r.a?.line} ↔ ${rb.name} ${r.b?.file}:${r.b?.line} "${r.a?.name}"\n`,
                );
                if (r.onlyA) process.stdout.write(`         only ${ra.name}: ${r.onlyA.slice(0, 300)}\n`);
                if (r.onlyB) process.stdout.write(`         only ${rb.name}: ${r.onlyB.slice(0, 300)}\n`);
            } else {
                const x = r.a ?? r.b;
                process.stdout.write(
                    `  ${r.kind === 'only-a' ? `only ${ra.name}` : `only ${rb.name}`}  ${x?.file}:${x?.line} "${x?.name}"\n`,
                );
            }
        }
    }
    return drift ? 1 : 0;
}
