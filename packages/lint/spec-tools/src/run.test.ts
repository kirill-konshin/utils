import { describe, expect, test } from 'vitest';

import { progress } from './run';

describe('run', () => {
    const at = new Date(2026, 0, 1, 9, 5, 7);

    test("shows the orchestrator's text and one timestamped line per tool call, a sub-agent's indented", () => {
        expect(progress({ type: 'stream_event', event: { type: 'content_block_delta', delta: { text: 'hi' } } })).toBe(
            'hi',
        );
        const call = { type: 'tool_use', name: 'Read', input: { file_path: 'a.ts' } };
        expect(progress({ type: 'assistant', message: { content: [call] } }, at)).toBe('[09:05:07] Read a.ts\n');
        expect(progress({ type: 'assistant', parent_tool_use_id: 'x', message: { content: [call] } }, at)).toBe(
            '[09:05:07]   ↳ Read a.ts\n',
        );
        expect(progress({ type: 'result', result: 'done' })).toBe('');
    });
});
