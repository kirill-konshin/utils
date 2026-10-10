/**
 * The coverage report: for every requirement and scenario, what binds it, which pointers name it, and its status —
 * from bindings and markers only; a code or document citation never changes a status. Markdown, safe to publish as
 * MDX. It fails nothing.
 */
import type { Citation } from './citations';
import { boundAnchors } from './citations';
import type { Corpus, Scenario } from './corpus';
import { KNOWN_GAP, RETIRED } from './corpus';

const MDX_ESCAPES: Record<string, string> = { '<': '&lt;', '>': '&gt;', '{': '&#123;', '}': '&#125;', '|': '\\|' };
/** Text safe in an MDX table cell: angle brackets and braces would read as JSX, a pipe as a column. */
export const mdx = (s: string) => s.replace(/[<>{}|]/g, (c) => MDX_ESCAPES[c]);

const show = (sites: Citation[]) => (sites.length ? sites.map((s) => `\`${s.file}:${s.line}\``).join('<br />') : '—');

export function coverageReport(
    corpus: Corpus,
    citations: Citation[],
): { markdown: string; totals: Record<string, number> } {
    const bound = boundAnchors(citations);

    const byAnchor: Map<string, Citation[]> = new Map();
    for (const c of citations) {
        if (!c.anchor || !c.resolves) continue;
        const key = `${c.target}#${c.anchor}`;
        byAnchor.set(key, [...(byAnchor.get(key) ?? []), c]);
    }
    const sites = (key: string) => byAnchor.get(key) ?? [];
    const totals = {
        requirements: 0,
        capabilities: corpus.capabilities.length,
        advisory: 0,
        gaps: 0,
        unboundRequirements: 0,
        unboundScenarios: 0,
        retired: 0,
    };
    const body = [];
    const gapRows = [];
    const retiredRows = [];
    for (const cap of [...corpus.capabilities].sort((a, b) => a.capability.localeCompare(b.capability))) {
        body.push(
            `## ${cap.capability}`,
            '',
            '| Requirement / Scenario | Spec | Bound by | Pointers | Status |',
            '| --- | --- | --- | --- | --- |',
        );
        for (const r of cap.requirements) {
            totals.requirements++;
            const reqKey = `${r.file}#${r.slug}`;
            const scenarioBound = (s: Scenario) =>
                bound.has(`${r.file}#${s.slug}`) || (r.scenarios.length === 1 && bound.has(reqKey));
            const anyBound = bound.has(reqKey) || r.scenarios.some(scenarioBound);
            if (r.advisory) totals.advisory++;
            totals.gaps += r.gaps.length;
            if (!r.advisory && !anyBound) totals.unboundRequirements++;
            const status = r.advisory
                ? 'advisory'
                : r.gaps.length
                  ? `known gap (${r.gaps.map((g) => mdx(g.tracker)).join(', ')})`
                  : anyBound
                    ? 'tested'
                    : 'no test';
            const own = sites(reqKey);
            body.push(
                `| [${mdx(r.name)}](${r.file}#${r.slug}) | \`:${r.line}\` | ${show(own.filter((c) => c.binding))} | ${show(own.filter((c) => !c.binding))} | ${status} |`,
            );
            for (const s of r.scenarios) {
                const key = `${r.file}#${s.slug}`;
                const mine = [...sites(key), ...(r.scenarios.length === 1 ? own.filter((c) => c.binding) : [])];
                const isBound = scenarioBound(s);
                const gap = r.gaps.find((g) => g.exempts.includes(s.slug));
                if (!r.advisory && !isBound) totals.unboundScenarios++;
                const sStatus = r.advisory
                    ? '—'
                    : isBound
                      ? 'bound'
                      : gap
                        ? `known gap (${mdx(gap.tracker)})`
                        : 'no test';
                body.push(
                    `| › [${mdx(s.name)}](${key}) | \`:${s.line}\` | ${show(mine.filter((c) => c.binding))} | ${show(mine.filter((c) => !c.binding))} | ${sStatus} |`,
                );
            }
            for (const g of r.gaps)
                gapRows.push(`| ${mdx(g.tracker)} | [${mdx(r.id)}](${r.file}#${r.slug}) | ${mdx(g.text)} |`);
            for (const m of r.markers)
                if (m.label === RETIRED || (m.label === KNOWN_GAP && !m.tracker)) {
                    totals.retired++;
                    retiredRows.push(`- \`${r.file}:${m.line}\` ${mdx(m.text)}`);
                }
        }
        body.push('');
    }
    const header = [
        '# Specification coverage',
        '',
        `${totals.requirements} requirements across ${totals.capabilities} capabilities. **${totals.advisory}** advisory; **${totals.gaps}** known gaps; **${totals.unboundRequirements}** REQUIRED requirements bound by no test; **${totals.unboundScenarios}** REQUIRED scenarios bound by no test; **${totals.retired}** retired markers.`,
        '',
        'A status comes from bindings and markers only: a test block, type assertion, lint entry or declared check that cites a scenario binds it; a code or document citation is a pointer and changes nothing. Nothing here fails a build.',
        '',
    ];
    const trailer = [
        '## Known gaps',
        '',
        ...(gapRows.length ? ['| Tracker | Requirement | Gap |', '| --- | --- | --- |', ...gapRows] : ['_None._']),
        '',
        '## Retired markers',
        '',
        ...(retiredRows.length ? retiredRows : ['_None._']),
        '',
    ];
    return { markdown: [...header, ...body, ...trailer].join('\n'), totals };
}
