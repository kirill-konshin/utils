import { describe, expect, test } from 'vitest';

import { slugify } from '../../skills/spec-steward/scripts/lib/util.mjs';
import { type RequirementBlock, requirementBlocks } from './changeGates';
import { capabilityMoves, classify, render } from './specDiff';

const block = (name: string, text: string, file = 'openspec/specs/cap/spec.md', line = 9): RequirementBlock => ({
    file,
    capability: 'cap',
    name,
    slug: slugify(`Requirement: ${name}`),
    line,
    block: `### Requirement: ${name}\n\n${text}`,
});

describe('classify', () => {
    const rule = block(
        'Ports are explicit',
        'The system SHALL read its port from `MCP_PORT`.\n\n#### Scenario: Unset\n\n- **WHEN** unset\n- **THEN** it fails',
    );

    test('reports nothing when the requirements are the same', () => {
        expect(classify([rule], [rule])).toEqual({ added: [], modified: [], removed: [], renamed: [] });
    });

    test('ignores whitespace-only differences', () => {
        const respaced = { ...rule, block: rule.block.replace(/\n\n/g, '\n\n\n').replace('SHALL read', 'SHALL  read') };
        expect(classify([rule], [respaced]).modified).toEqual([]);
    });

    test('classifies a heading only the head has as ADDED and one only the base has as REMOVED', () => {
        const other = block('Logs are JSON', 'One object per line.');
        const diff = classify([rule], [other]);
        expect(diff.added).toEqual([other]);
        expect(diff.removed).toEqual([rule]);
        expect(diff.renamed).toEqual([]);
    });

    test('classifies a changed block under the same heading as MODIFIED', () => {
        const edited = { ...rule, block: rule.block.replace('it fails', 'it exits 1') };
        expect(classify([rule], [edited]).modified).toEqual([{ before: rule, after: edited }]);
    });

    test('pairs a removed and an added heading with the same body in one file as RENAMED', () => {
        const renamed = block('Ports are never guessed', rule.block.split('\n').slice(2).join('\n'));
        const diff = classify([rule], [renamed]);
        expect(diff.renamed).toEqual([{ from: rule, to: renamed }]);
        expect(diff.added).toEqual([]);
        expect(diff.removed).toEqual([]);
    });

    test('keeps a rename that also edits the body as REMOVED plus ADDED', () => {
        const renamedAndEdited = block(
            'Ports are never guessed',
            'The system SHALL read its port from `MCP_PORT` or die.',
        );
        const diff = classify([rule], [renamedAndEdited]);
        expect(diff.renamed).toEqual([]);
        expect(diff.added).toEqual([renamedAndEdited]);
        expect(diff.removed).toEqual([rule]);
    });

    test('pairs each removed heading at most once', () => {
        const twinA = block('Twin A', 'Same body.');
        const twinB = block('Twin B', 'Same body.');
        const merged = block('Twin', 'Same body.');
        const diff = classify([twinA, twinB], [merged]);
        expect(diff.renamed).toEqual([{ from: twinA, to: merged }]);
        expect(diff.removed).toEqual([twinB]);
        expect(diff.added).toEqual([]);
    });

    test('does not pair across files', () => {
        const moved = block(
            'Ports are explicit',
            rule.block.split('\n').slice(2).join('\n'),
            'openspec/specs/other/spec.md',
        );
        const diff = classify([rule], [moved]);
        expect(diff.renamed).toEqual([]);
        expect(diff.removed).toEqual([rule]);
        expect(diff.added).toEqual([moved]);
    });
});

describe('render', () => {
    const before = block('Ports are explicit', 'Old text.');
    const after = { ...before, block: before.block.replace('Old', 'New') };

    test('starts with a fixed first line carrying every count', () => {
        const text = render(classify([before], [after]), 'origin/main');
        expect(text.split('\n')[0]).toBe('SPEC DIFF 1 changed (0 added, 1 modified, 0 removed, 0 renamed)');
    });

    test('shows a modified requirement in full with its old block collapsed beneath', () => {
        const text = render(classify([before], [after]), 'origin/main');
        expect(text).toContain('## MODIFIED');
        expect(text).toContain('New text.');
        expect(text).toContain('<summary>before</summary>');
        expect(text).toContain('Old text.');
    });

    test('shows a removed requirement by its old block and where it was', () => {
        const text = render(classify([before], []), 'origin/main');
        expect(text).toContain('## REMOVED');
        expect(text).toContain('was `openspec/specs/cap/spec.md:9`');
        expect(text).toContain('Old text.');
    });

    test('says so when nothing changed', () => {
        const text = render(classify([before], [before]), 'HEAD');
        expect(text.split('\n')[0]).toBe('SPEC DIFF 0 changed (0 added, 0 modified, 0 removed, 0 renamed)');
        expect(text).toContain('No requirement changed.');
    });

    test('lists the capabilities that moved, and a verbatim move changes no requirement', () => {
        const moved = capabilityMoves(
            new Map([['openspec/specs/web/state/spec.md', 'openspec/specs/apps/state/spec.md']]),
        );
        expect(moved).toEqual([{ from: 'web/state', to: 'apps/state' }]);
        const text = render(classify([before], [before]), 'origin/main', moved);
        expect(text.split('\n')[0]).toBe('SPEC DIFF 0 changed (0 added, 0 modified, 0 removed, 0 renamed)');
        expect(text).toContain('## MOVED');
        expect(text).toContain('- web/state → apps/state');
        expect(text).toContain('No requirement changed.');
    });
});

describe('requirementBlocks', () => {
    test('cuts each requirement from its heading to the line before the next, trimming trailing blanks', () => {
        const text = [
            '# cap Specification',
            '',
            '## Requirements',
            '',
            '### Requirement: First rule',
            '',
            'Body one.',
            '',
            '#### Scenario: A',
            '',
            '- **WHEN** x',
            '- **THEN** y',
            '',
            '',
            '### Requirement: Second rule',
            '',
            'Body two.',
            '',
        ].join('\n');
        const blocks = requirementBlocks('openspec/specs/cap/spec.md', text);
        expect(blocks.map((b) => [b.name, b.slug, b.line, b.capability])).toEqual([
            ['First rule', 'requirement-first-rule', 5, 'cap'],
            ['Second rule', 'requirement-second-rule', 15, 'cap'],
        ]);
        expect(blocks[0]!.block.endsWith('- **THEN** y')).toBe(true);
        expect(blocks[1]!.block).toBe('### Requirement: Second rule\n\nBody two.');
    });
});
