import fs from 'node:fs';
import path from 'node:path';

const TEST_SUFFIX = /\.test\.(ts|tsx|js|jsx|mts|mjs|cts|cjs)$/;
const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs'];

/**
 * Only `*.test.*` is checked, not `*.spec.*` - per testing.md, spec files cover e2e/integration
 * flows that don't map 1:1 to a single sibling source file, so co-location isn't meaningful there.
 */
export const testColocation = {
    meta: {
        type: 'problem',
        docs: {
            description: 'require *.test.* files to sit next to the source file they test, not in a separate folder',
        },
        schema: [],
        messages: {
            missingSibling:
                "No sibling source file found for '{{testFile}}'. Expected e.g. '{{expected}}' in the same directory, not a separate __tests__/ folder.",
        },
    },
    create(context) {
        const filename = context.filename ?? context.getFilename();
        const base = path.basename(filename);
        const match = base.match(TEST_SUFFIX);

        if (!match) return {};

        const dir = path.dirname(filename);
        const stem = base.slice(0, -match[0].length);
        const hasSibling = SOURCE_EXTS.some((ext) => fs.existsSync(path.join(dir, `${stem}${ext}`)));

        if (hasSibling) return {};

        return {
            Program(node) {
                context.report({
                    node,
                    messageId: 'missingSibling',
                    data: { testFile: base, expected: `${stem}.ts` },
                });
            },
        };
    },
};
