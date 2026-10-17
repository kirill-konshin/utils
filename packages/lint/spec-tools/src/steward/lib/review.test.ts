import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { cleanTempDirs, SPEC, SPEC_FILE, repo } from '../steward.fixture';
import { type Finding as ReviewFinding, lint, parseReview, render, status, verify } from './review';

// Every case drives git; on a loaded machine one process start can take seconds.
vi.setConfig({ testTimeout: 300_000 });

afterEach(cleanTempDirs);

describe('review', () => {
    const finding = (over: Partial<ReviewFinding>) => ({
        repo: 'X',
        file: SPEC_FILE,
        line: 11,
        quote: 'The service SHALL confirm an order exactly once … timed out.',
        layer: 'SPEC-REQUIRED',
        criteria: [5],
        whatsWrong: 'w',
        proposed: 'Keep → OpenSpec REQUIRED invariant',
        area: 'demo',
        ...over,
    });

    test('renders YAML items whose quotes are found, one block per item, and counts the owner’s answers', () => {
        const dir = repo({ [SPEC_FILE]: SPEC });
        const { yaml } = render({
            findings: [finding({ judgeConfidence: 85 })],
            themes: [
                {
                    title: 'Restating scenarios',
                    whatsWrong: 'w',
                    proposed: 'Delete → noise',
                    layer: 'DELETE',
                    criteria: [19],
                    members: [
                        finding({ line: 27, quote: 'Scenario: Lean payload', area: 'demo', readerConfidence: 60 }),
                    ],
                },
            ],
        });
        // A theme's confidence is its lowest member's: at 70% or lower, it is listed under "Low confidence".
        expect(yaml).toMatch(/^R-001:\n {2}title: /m);
        expect(yaml).toMatch(/^# Low confidence — 70% or lower\nR-002:\n {2}theme: Restating scenarios/m);
        let items = parseReview(yaml);
        expect(items.map((it) => [it.id, it.theme, it.entry.confidence])).toEqual([
            ['R-001', false, 85],
            ['R-002', true, 60],
        ]);
        expect(lint(yaml).problems).toEqual([]);
        expect(verify(items, new Map([['X', dir]]))).toEqual([]);
        expect(verify(parseReview(yaml.replace('exactly once', 'twice')), new Map([['X', dir]]))[0]).toContain(
            'quote not found',
        );
        expect(lint('R-001:\n  rule: [\n').problems[0]).toMatch(/^line \d+: not valid YAML/);

        const answered = yaml
            .replace('decision: ""', 'decision: ✅')
            .replace('decision: ""', 'decision: why not merge it?');
        items = parseReview(answered);
        const s = status(items);
        expect(s.counts).toMatchObject({ accepted: 1, comment: 1 });
        expect(s.acceptedNotApplied).toEqual(['R-001']);
        expect(
            status(parseReview(answered.replace('decision: ✅', 'decision: ✅\n  applied: R-001 — done')))
                .acceptedNotApplied,
        ).toEqual([]);
        // The owner's decision on one member of a theme is a comment to process, whatever the theme's own decision.
        const member = yaml.replace(/(\n {6}location: X [^\n]+:27)/, '$1\n      decision: keep this one');
        expect(status(parseReview(member)).comments).toEqual(['R-002']);
    });
});
