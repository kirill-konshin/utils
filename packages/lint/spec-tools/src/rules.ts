/**
 * What every audit brief shares: where the judging rules are (`skills/spec-tools/references/rules/`), how a model
 * writes each YAML key, and the message that sends a file's errors back to the model that wrote it. The rules say what
 * to judge; the briefs say only the assignment.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { SKILLS_DIR } from './skillsDir';

/** The judging rules of one audit role: `common`, `spec-verify`, `spec-verify-judge`, `spec-steward`. */
export type RulesName = 'common' | 'spec-verify' | 'spec-verify-judge' | 'spec-steward';

export const rulesPath = (name: RulesName): string =>
    path.join(SKILLS_DIR, 'spec-tools/references/rules', `${name}.md`);

/** A rules file's text, for a brief that inlines it (the judges load no skill). */
export const rulesText = (name: RulesName): string => fs.readFileSync(rulesPath(name), 'utf8').trim();

/** The instruction to Read the named rules files, as paths relative to the repository. */
export const readRules = (repo: string, ...names: RulesName[]): string =>
    `Read the judging rules, in this order: ${['common' as const, ...names].map((n) => path.relative(repo, rulesPath(n))).join(', ')}.`;

/** How a model writes each kind of YAML key, so the file parses and the check passes. */
export const KEY_STYLE = [
    'Write the file as YAML. Write each key in this style:',
    '- Prose (detail, reason, scenario, whatsWrong, proposed): a literal block, `key: |`, with the text indented on the next lines.',
    '- Quoted source text (quotes[].text, quote): a stripped literal block, `text: |-`, with the line as it is written in the source.',
    '- Ids, paths, kinds, tiers, verdicts and layers (where, file, kind, tier, verdict, layer, themeKey): double-quoted strings.',
    '- Numbers (line, part, reader, readerConfidence, judgeConfidence): plain integers.',
    '- Lists of ids (judged, capabilities, sound, evidence): block lists of double-quoted strings.',
    '- Booleans (needsHumanIntent): true or false.',
    'When you stop, the tool checks the file and sends any errors back to you.',
].join('\n');

/** The message that sends a file's errors back to the model that wrote it. */
export const correction = (file: string, errors: readonly string[], canEdit: boolean): string =>
    [
        `The file ${file} has these errors:`,
        ...errors.map((e) => `- ${e}`),
        '',
        `Correct the file. ${canEdit ? 'Use the Edit tool, or write the whole file again.' : 'Write the whole file again with the Write tool.'} Do not change anything else.`,
        KEY_STYLE,
        'Then return one line: the path.',
    ].join('\n');
