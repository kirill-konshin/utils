/**
 * `spec-tools html <file.md>...`: GitHub-flavoured Markdown to a fully self-contained HTML file next to each — the
 * GitHub stylesheet (light and dark) inlined, so a report opens straight from CI artifacts with no external reference.
 * A missing file is skipped.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import css from 'github-markdown-css/github-markdown.css?raw';
import { marked } from 'marked';

const escape = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

/** One Markdown document as a standalone page. */
export const page = (title: string, markdown: string): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
${css}
.markdown-body { box-sizing: border-box; max-width: 980px; margin: 0 auto; padding: 2rem 3rem; }
@media (max-width: 767px) { .markdown-body { padding: 1rem; } }
</style>
</head>
<body class="markdown-body">
${marked.parse(markdown, { gfm: true, async: false })}
</body>
</html>
`;

export function html(files: readonly string[]): number {
    if (!files.length) {
        console.error('usage: spec-tools html <file.md> [more.md ...]');
        return 2;
    }
    for (const file of files) {
        if (!fs.existsSync(file)) {
            console.warn(`skip (not found): ${file}`);
            continue;
        }
        const out = file.replace(/\.md$/i, '.html');
        fs.writeFileSync(out, page(path.basename(file, path.extname(file)), fs.readFileSync(file, 'utf8')));
        console.log(`wrote ${out}`);
    }
    return 0;
}
