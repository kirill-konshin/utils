import { describe, expect, test } from 'vitest';

import { page } from './html';

describe('html', () => {
    test('renders GitHub-flavoured Markdown into a page with the stylesheet inlined and the title escaped', () => {
        const html = page('a<b', '| a | b |\n| - | - |\n| 1 | 2 |\n');
        expect(html).toContain('<title>a&lt;b</title>');
        expect(html).toContain('<table>');
        expect(html).toMatch(/<style>\n\.markdown-body \{/);
        expect(html).not.toMatch(/<link |src="http/);
    });
});
