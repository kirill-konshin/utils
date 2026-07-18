import fs from 'node:fs';
import path from 'node:path';

const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs'];
const TEST_SUFFIX = new RegExp(`\\.test\\.(${SOURCE_EXTS.map((ext) => ext.slice(1)).join('|')})$`);

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
        const base = path.basename(context.filename);
        const match = base.match(TEST_SUFFIX);

        if (!match) return {};

        const stem = base.slice(0, -match[0].length);

        let siblings;
        try {
            siblings = fs.readdirSync(path.dirname(context.filename));
        } catch {
            return {}; // virtual filename (stdin, editor buffer) - no directory to check against
        }

        if (SOURCE_EXTS.some((ext) => siblings.includes(`${stem}${ext}`))) return {};

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
