export const meta = {
    name: 'spec-steward-audit',
    description:
        'Audit OpenSpec corpora for specification quality, evidence and placement; verified findings for a review file',
    whenToUse:
        'A corpus-wide or affected-set specification audit whose findings become a spec-steward review file (args: roots, units, skillDir, placementGuide, context)',
    phases: [
        { title: 'Understand', detail: 'architecture, enforcement and decision-history maps' },
        { title: 'Audit', detail: 'one auditor per part and per sweep' },
        { title: 'Verify', detail: 'factual lens, then judgment lens, per unit' },
        { title: 'Critic', detail: 'completeness critic and targeted follow-up units' },
        { title: 'Consolidate', detail: 'merge duplicates per area, then themes across areas' },
    ],
};

/* global args, agent, parallel, pipeline, phase, log -- provided by the Workflow runtime */

// ---------------------------------------------------------------------------------------------------------------------
// Arguments (all paths absolute):
//   roots:          [{ name, path, specsDir? }]                repositories under audit
//   skillDir:       the spec-steward folder (references/*.md are read by every agent)
//   placementGuide: rules/agent.md — where each kind of guidance belongs
//   context:        run-specific facts and owner decisions, verbatim into every prompt
//   understand:     [{ key, title, prompt }]                   map-makers (default: none)
//   evidenceDir:    where `steward evidence` wrote <NAME>/<capability>.md
//   units:          [{ key, title, kind: 'part'|'sweep', focus, capabilities?: ['NAME:cap'], files?: [path], effort? }]
//                   a part reads each capability's spec and evidence bundle, then its extra files
//   allCapabilities:['NAME:cap']                               for the critic's coverage table
//   maxCriticRounds: default 2
// ---------------------------------------------------------------------------------------------------------------------

const A = args ?? {};
const roots = A.roots ?? [];
const LAYERS = [
    'SPEC-REQUIRED',
    'SPEC-ADVISORY',
    'DESIGN',
    'AGENTS',
    'RULE',
    'SKILL',
    'COMMAND',
    'OPSX-CONFIG',
    'README',
    'TOOLING',
    'TEST',
    'CI',
    'MERGE',
    'REWRITE',
    'DELETE',
];
const FINDING_PROPS = {
    repo: { type: 'string', description: 'repository NAME as given' },
    file: { type: 'string', description: 'repository-relative path' },
    line: { type: 'integer', description: '1-based line of the heading or exact sentence quoted' },
    quote: {
        type: 'string',
        description: 'verbatim text from that line or the block starting there, ≤ 300 chars, … elides',
    },
    level: { type: 'string', enum: ['requirement', 'scenario', 'sentence', 'capability', 'file', 'section'] },
    ruleName: { type: 'string', description: 'requirement/scenario heading, or a short label for a non-spec rule' },
    criteria: { type: 'array', items: { type: 'integer' }, description: 'numbers from criteria.md (1–24)' },
    layer: { type: 'string', enum: LAYERS, description: 'the owning layer proposed' },
    whatsWrong: { type: 'string' },
    proposed: {
        type: 'string',
        description: 'starts with Keep → / Reclassify → / Move → / Replace → / Merge → / Rewrite → / Delete →',
    },
    evidence: { type: 'array', items: { type: 'string' }, description: 'file:line references actually read' },
    crossRefs: { type: 'array', items: { type: 'string' } },
    themeKey: {
        type: 'string',
        description: 'kebab-case key of the underlying problem, from the vocabulary when one fits',
    },
    needsHumanIntent: { type: 'boolean' },
    reversesPastDecision: { type: 'string', description: 'the past owner decision this would reverse, or empty' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
};
const REQUIRED_FINDING = [
    'repo',
    'file',
    'line',
    'quote',
    'ruleName',
    'criteria',
    'layer',
    'whatsWrong',
    'proposed',
    'themeKey',
    'needsHumanIntent',
    'confidence',
];
const FINDINGS = {
    type: 'object',
    properties: {
        findings: { type: 'array', items: { type: 'object', properties: FINDING_PROPS, required: REQUIRED_FINDING } },
        sound: {
            type: 'array',
            items: { type: 'string' },
            description: 'NAME:capability#requirement-slug judged correct, well-placed, adequately evidenced',
        },
        notes: { type: 'array', items: { type: 'string' } },
    },
    required: ['findings', 'sound'],
};
const VERDICTS = {
    type: 'object',
    properties: {
        verdicts: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    index: { type: 'integer' },
                    verdict: { type: 'string', enum: ['keep', 'revise', 'drop'] },
                    reason: { type: 'string' },
                    revised: { type: 'object', properties: FINDING_PROPS },
                },
                required: ['index', 'verdict', 'reason'],
            },
        },
    },
    required: ['verdicts'],
};
const CONSOLIDATED = {
    type: 'object',
    properties: {
        findings: {
            type: 'array',
            items: {
                type: 'object',
                properties: { ...FINDING_PROPS, sourceIds: { type: 'array', items: { type: 'string' } } },
                required: [...REQUIRED_FINDING, 'sourceIds'],
            },
        },
    },
    required: ['findings'],
};
const THEME = {
    type: 'object',
    properties: {
        title: { type: 'string' },
        whatsWrong: { type: 'string' },
        proposed: { type: 'string' },
        layer: { type: 'string', enum: LAYERS },
        criteria: { type: 'array', items: { type: 'integer' } },
        needsHumanIntent: { type: 'boolean' },
        members: {
            type: 'array',
            items: {
                type: 'object',
                properties: { id: { type: 'string' }, note: { type: 'string' } },
                required: ['id'],
            },
        },
        excluded: { type: 'array', items: { type: 'string' } },
    },
    required: ['title', 'whatsWrong', 'proposed', 'layer', 'criteria', 'members'],
};
const CRITIC = {
    type: 'object',
    properties: {
        verdict: { type: 'string' },
        gaps: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    key: { type: 'string' },
                    title: { type: 'string' },
                    focus: { type: 'string' },
                    files: { type: 'array', items: { type: 'string' } },
                },
                required: ['key', 'title', 'focus', 'files'],
            },
        },
    },
    required: ['verdict', 'gaps'],
};

const THEME_KEYS = [
    'restating-scenario',
    'single-scenario-padding',
    'bdd-verbosity',
    'impl-detail-in-spec',
    'coding-convention-in-spec',
    'process-rule-in-spec',
    'agent-steering-as-spec',
    'tooling-should-enforce',
    'textual-test',
    'comment-as-evidence',
    'citation-upkeep',
    'unverifiable-absolute',
    'vague-obligation',
    'advisory-not-required',
    'duplicate-rule',
    'cross-repo-drift',
    'contradiction',
    'stale-rule',
    'scope-unclear',
    'repo-wide-reasoning',
    'placement-duplication',
    'agents-md-bloat',
    'ci-cost',
    'missing-invariant',
    'gap-marker',
];

const rootList = roots.map((r) => `- ${r.name} → ${r.path}`).join('\n');
const READ_FIRST = [
    `${A.skillDir}/references/model.md`,
    `${A.skillDir}/references/criteria.md`,
    A.placementGuide,
].filter(Boolean);

const COMMON = `You are part of a specification audit. READ-ONLY: never create, edit or delete a file, never run a command that changes anything (no installs, builds, formatters, git writes). Read, Grep, Glob and read-only shell (git show/log/diff, ls, cat, rg) only.

Repositories under audit (NAME → absolute path; paths in findings are repository-relative):
${rootList}

Read these first, in full — they are the standard you judge by:
${READ_FIRST.map((p) => `- ${p}`).join('\n')}

Non-negotiables:
- Specification quality first. Ordinary implementation bugs are out of scope unless they reveal the rule is unrealistic, unclear, outdated, ambiguous, or contradicted by what the tests actually assert.
- Comments, descriptions, prompt text and citations are never evidence that code complies, and never a violation by themselves. Judge executable behaviour and structure.
- For every rule you would keep REQUIRED, ask what meaningful failure its verification catches. Never propose a test merely because a rule lacks one; never propose a test of incidental text or structure.
- Internal component and API contracts are legitimate specification. The line is contract versus implementation/process, not product versus engineering.
- Do not decide intent silently: when the intended meaning is ambiguous, describe the readings, propose options, set needsHumanIntent.
- No style preferences: every finding states a concrete problem.
- A proposal that reverses an earlier owner decision says so (reversesPastDecision).
- Quote the ORIGINAL text verbatim; the line must be where that text is. Open the file to confirm before writing it.

Theme keys (use one when it fits; coin a new kebab-case key only when none does): ${THEME_KEYS.join(', ')}.

Run context — facts established and decisions the owner has already made:
${A.context ?? '(none)'}`;

const asJson = (x) => JSON.stringify(x, null, 1);
const filesOf = (u) => [
    ...(u.capabilities ?? []).flatMap((c) => {
        const [name, cap] = c.split(':');
        const root = roots.find((r) => r.name === name);
        const spec = `${root?.path}/${root?.specsDir ?? 'openspec/specs'}/${cap}/spec.md`;
        return A.evidenceDir ? [spec, `${A.evidenceDir}/${name}/${cap}.md`] : [spec];
    }),
    ...(u.files ?? []),
];
const ids = (n) => `F${n}`;
let counter = 0;
const tag = (unit, list) =>
    (list ?? []).map((f) => ({
        ...f,
        id: ids(++counter),
        unit: unit.key,
        crossRefs: f.crossRefs ?? [],
        evidence: f.evidence ?? [],
    }));

// ---------------------------------------------------------------------------------------------------------------------
phase('Understand');
const maps = await parallel(
    (A.understand ?? []).map(
        (u) => () =>
            agent(
                `${COMMON}\n\n# Your task: ${u.title}\n\n${u.prompt}\n\nReturn the map as concise markdown (≤ 2500 words), with file:line references for every claim.`,
                {
                    label: `map:${u.key}`,
                    phase: 'Understand',
                    effort: 'high',
                },
            ),
    ),
);
const MAPS = (A.understand ?? [])
    .map((u, i) => `## Map — ${u.title}\n\n${maps[i] ?? '(this map is unavailable — read the sources yourself)'}`)
    .join('\n\n');
log(`maps ready: ${maps.filter(Boolean).length}/${(A.understand ?? []).length}`);

// ---------------------------------------------------------------------------------------------------------------------
const auditPrompt = (u) => `${COMMON}

${MAPS}

# Your unit: ${u.title} (${u.kind})

${u.focus}

Read IN FULL (spec files first; then evidence bundles, which quote each requirement with line numbers, the tests citing it, code citations, where its terms occur, and related requirements in other capabilities and repositories):
${filesOf(u)
    .map((f) => `- ${f}`)
    .join('\n')}

Then trace into code and tests wherever a verdict depends on them — open the source, do not guess.

Output:
- One finding per (rule, problem). A rule may be a requirement, a scenario, a sentence, or — outside the specs — a section or line of AGENTS.md, a skill, a config, a script, a CI job.
- criteria: numbers from criteria.md. layer: the owning layer you propose. proposed: begins with the target notation and says exactly what to do; a rewrite gives the new text; a move names the target file or glob.
- sound: ${u.kind === 'part' ? 'EVERY requirement of your capabilities that you judged correct, well-placed and adequately evidenced, as NAME:capability#requirement-slug. Every requirement of your unit must appear either in a finding (on it or one of its scenarios) or in sound.' : 'leave empty unless you judged specific requirements sound.'}
- Be aggressive about questionable specification design and conservative about deciding intent.`;

const factualPrompt = (u, res) => `${COMMON}

# Verify FACTS of these findings (unit: ${u.title})

For each finding, by index: open the file at the line. Is the quote verbatim there (or within the block that starts there)? Are the evidence references real, and do they say what the finding claims? Is every claim about code, tests, tooling or CI true — open them.
- keep: all true.
- revise: correct the line, quote, file or a factual claim — return only the corrected fields in revised.
- drop: a central claim is false and cannot be repaired.
Be strict; a finding built on a misreading is revised or dropped.

Findings:
${asJson(res.findings.map((f, index) => ({ index, ...f, id: undefined, unit: undefined })))}`;

const judgePrompt = (u, res) => `${COMMON}

${MAPS}

# Judge these findings as the skeptic (unit: ${u.title})

For each finding, by index:
- It silently decides intent that is genuinely ambiguous → revise: needsHumanIntent true, options in proposed.
- It is a style preference, an ordinary implementation bug, or speculation → drop.
- Its proposed verification would not catch a real failure (compliance theatre) → revise or drop.
- It moves an internal contract out of the spec only because it is not user-facing → revise.
- The target layer contradicts the placement guide → revise.
- It reverses a past owner decision without saying so → revise reversesPastDecision.
- It duplicates another finding in this list → drop the weaker, say which in reason.
Default to keep when the finding is concrete, grounded and its proposal is sound. Sharpen wording where it helps the owner decide quickly.

Findings:
${asJson(res.findings.map((f, index) => ({ index, ...f, id: undefined, unit: undefined })))}`;

const applyVerdicts = (res, v, lens) => {
    if (!v) return res;
    const dropped = [...(res.dropped ?? [])];
    const findings = [];
    res.findings.forEach((f, i) => {
        const verdict = (v.verdicts ?? []).find((x) => x.index === i);
        if (verdict?.verdict === 'drop') dropped.push({ ...f, droppedBy: lens, reason: verdict.reason });
        else if (verdict?.verdict === 'revise')
            findings.push({
                ...f,
                ...(verdict.revised ?? {}),
                id: f.id,
                unit: f.unit,
                revisedBy: [...(f.revisedBy ?? []), lens],
            });
        else findings.push(f);
    });
    return { ...res, findings, dropped };
};

const runUnits = (units) =>
    pipeline(
        units,
        (u) =>
            agent(auditPrompt(u), {
                label: `audit:${u.key}`,
                phase: 'Audit',
                schema: FINDINGS,
                effort: u.effort ?? 'high',
            }).then((r) =>
                r
                    ? {
                          unit: u.key,
                          findings: tag(u, r.findings),
                          sound: r.sound ?? [],
                          notes: r.notes ?? [],
                          dropped: [],
                      }
                    : null,
            ),
        (res, u) =>
            res && res.findings.length
                ? agent(factualPrompt(u, res), {
                      label: `facts:${u.key}`,
                      phase: 'Verify',
                      schema: VERDICTS,
                      effort: 'medium',
                  }).then((v) => applyVerdicts(res, v, 'facts'))
                : res,
        (res, u) =>
            res && res.findings.length
                ? agent(judgePrompt(u, res), {
                      label: `judge:${u.key}`,
                      phase: 'Verify',
                      schema: VERDICTS,
                      effort: 'high',
                  }).then((v) => applyVerdicts(res, v, 'judgment'))
                : res,
    );

phase('Audit');
const results = (await runUnits(A.units ?? [])).filter(Boolean);
log(
    `audited ${results.length}/${(A.units ?? []).length} units: ${results.reduce((n, r) => n + r.findings.length, 0)} findings kept, ${results.reduce((n, r) => n + r.dropped.length, 0)} dropped`,
);

// ---------------------------------------------------------------------------------------------------------------------
phase('Critic');
const criticReports = [];
const capOf = (f) => {
    const root = roots.find((r) => r.name === f.repo);
    const specs = (root?.specsDir ?? 'openspec/specs') + '/';
    return f.file?.startsWith(specs) && f.file.endsWith('/spec.md')
        ? `${f.repo}:${f.file.slice(specs.length, -'/spec.md'.length)}`
        : null;
};
for (let round = 1; round <= (A.maxCriticRounds ?? 2); round++) {
    const all = results.flatMap((r) => r.findings);
    const perCap = (A.allCapabilities ?? [...new Set((A.units ?? []).flatMap((u) => u.capabilities ?? []))]).map(
        (c) => {
            const n = all.filter((f) => capOf(f) === c).length;
            const sound = results.flatMap((r) => r.sound).filter((s) => s.startsWith(`${c}#`)).length;
            return `${c}: ${n} findings, ${sound} sound`;
        },
    );
    const perCriterion = Array.from(
        { length: 24 },
        (_, i) => `${i + 1}: ${all.filter((f) => (f.criteria ?? []).includes(i + 1)).length}`,
    );
    const unitsRun = (A.units ?? []).concat(criticReports.flatMap((c) => c.gaps)).map((u) => `${u.key} — ${u.title}`);
    const critic = await agent(
        `${COMMON}

# Completeness critic — round ${round}

The audit so far. What is missing: a capability with no findings and no sound list, a criterion that yielded nothing though the corpus plainly has cases, a modality not run, a source unread, a pair of shared capabilities not compared, a sweep that was too shallow? Read the sources yourself to decide; propose at most 6 targeted follow-up units (key, title, focus — exactly what to examine and why —, files to read in full). Return no gaps when coverage is genuinely complete; do not invent work.

Units run:
${unitsRun.join('\n')}

Per capability:
${perCap.join('\n')}

Per criterion (findings citing it):
${perCriterion.join(', ')}

Notes from auditors:
${results
    .flatMap((r) => r.notes.map((n) => `- [${r.unit}] ${n}`))
    .join('\n')
    .slice(0, 12000)}`,
        { label: `critic:${round}`, phase: 'Critic', schema: CRITIC, effort: 'high' },
    );
    if (!critic) break;
    criticReports.push({ round, verdict: critic.verdict, gaps: critic.gaps });
    log(`critic round ${round}: ${critic.gaps.length} gap(s) — ${critic.verdict.slice(0, 200)}`);
    if (!critic.gaps.length) break;
    const extra = (
        await runUnits(critic.gaps.map((g) => ({ ...g, key: `critic${round}-${g.key}`, kind: 'sweep' })))
    ).filter(Boolean);
    results.push(...extra);
}

// ---------------------------------------------------------------------------------------------------------------------
phase('Consolidate');
const unitByCap = new Map();
for (const u of A.units ?? []) for (const c of u.capabilities ?? []) unitByCap.set(c, u.key);
const areaOf = (f) => unitByCap.get(capOf(f)) ?? f.unit;
const areas = new Map();
for (const f of results.flatMap((r) => r.findings)) {
    const a = areaOf(f);
    areas.set(a, [...(areas.get(a) ?? []), f]);
}
const titleOf = (key) => (A.units ?? []).find((u) => u.key === key)?.title ?? key;

const consolidated = (
    await parallel(
        [...areas.entries()].map(
            ([area, list]) =>
                () =>
                    list.length < 2
                        ? Promise.resolve(list.map((f) => ({ ...f, area, sourceIds: [f.id] })))
                        : agent(
                              `${COMMON}

# Consolidate the findings of one area: ${titleOf(area)}

Several auditors and sweeps produced these findings. Merge duplicates — the same rule with the same problem becomes ONE finding listing every merged id in sourceIds; the same rule with different problems stays separate, each cross-referencing the other. Keep file, line and quote EXACTLY as in one of the sources (copy, never paraphrase). Write the merged whatsWrong and proposed so the owner can decide in one read; keep the strongest evidence; unify themeKeys for the same underlying problem. Drop nothing that is not a duplicate. Every input id must appear in exactly one output's sourceIds.

Findings:
${asJson(list.map((f) => ({ ...f, unit: undefined, revisedBy: undefined })))}`,
                              { label: `merge:${area}`, phase: 'Consolidate', schema: CONSOLIDATED, effort: 'high' },
                          ).then((r) =>
                              r
                                  ? r.findings.map((f) => ({ ...f, area }))
                                  : list.map((f) => ({ ...f, area, sourceIds: [f.id] })),
                          ),
        ),
    )
)
    .filter(Boolean)
    .flat()
    .map((f, i) => ({ ...f, cid: `C${i + 1}` }));

const byTheme = new Map();
for (const f of consolidated) byTheme.set(f.themeKey, [...(byTheme.get(f.themeKey) ?? []), f]);
const themeCandidates = [...byTheme.entries()].filter(([, list]) => list.length >= 3);
const themes = (
    await parallel(
        themeCandidates.map(
            ([key, list]) =>
                () =>
                    agent(
                        `${COMMON}

# Form a theme: ${key}

These findings were tagged with the same underlying problem. Decide which truly share ONE problem and ONE consolidated solution, and write that theme so the owner can give a single verdict: a title, what is wrong, the proposed solution (target notation), the layer, the criteria, and the members (by cid) each with a short member-specific note when the member differs from the rest. Exclude (by cid) any finding that does not fit; it stays a single item.

Findings:
${asJson(list.map((f) => ({ cid: f.cid, repo: f.repo, file: f.file, line: f.line, quote: f.quote, ruleName: f.ruleName, whatsWrong: f.whatsWrong, proposed: f.proposed, layer: f.layer, criteria: f.criteria })))}`,
                        { label: `theme:${key}`, phase: 'Consolidate', schema: THEME, effort: 'high' },
                    ).then((t) => (t ? { key, ...t } : null)),
        ),
    )
).filter(Boolean);

const themed = new Set(themes.flatMap((t) => t.members.map((m) => m.id)));
return {
    maps: Object.fromEntries((A.understand ?? []).map((u, i) => [u.key, maps[i] ?? null])),
    themes: themes.map((t) => ({
        ...t,
        members: t.members
            .map((m) => ({ ...consolidated.find((f) => f.cid === m.id), note: m.note ?? '' }))
            .filter((m) => m.cid),
    })),
    findings: consolidated.filter((f) => !themed.has(f.cid)),
    sound: [...new Set(results.flatMap((r) => r.sound))].sort(),
    dropped: results.flatMap((r) => r.dropped),
    critic: criticReports,
    stats: {
        units: results.length,
        kept: consolidated.length,
        themes: themes.length,
        dropped: results.reduce((n, r) => n + r.dropped.length, 0),
    },
};
