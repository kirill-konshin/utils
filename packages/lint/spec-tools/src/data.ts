/**
 * Every data file spec-tools and its models hand to one another is YAML, read and written here alone. A file a model
 * writes is checked against its schema at once (`checkData`); the errors go back to the same model, which corrects the
 * file (`workers.ts`, `run.ts`). Strings with more than one line are written as literal blocks, never folded, and no
 * object is written twice as an alias — a person reads these files, and some edit them.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseDocument, stringify } from 'yaml';

/** YAML text of a value: literal blocks for multi-line strings, no line folding, no aliases. */
export const toYaml = (data: unknown): string =>
    stringify(data, { lineWidth: 0, blockQuote: 'literal', aliasDuplicateObjects: false });

/** A value from YAML text; throws with the first parse error and its line. */
export function parseData<T>(text: string): T {
    const doc = parseDocument(text, { uniqueKeys: true });
    if (doc.errors.length) throw new Error(parseErrors(doc.errors)[0]);
    return doc.toJS({ maxAliasCount: -1 }) as T;
}

export const readData = <T>(file: string): T => parseData<T>(fs.readFileSync(file, 'utf8'));

/** A data file, if it exists and parses; otherwise undefined. */
export function tryReadData<T>(file: string): T | undefined {
    try {
        return readData<T>(file);
    } catch {
        return undefined;
    }
}

export function writeData(file: string, data: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, toYaml(data));
}

const parseErrors = (errors: readonly { message: string; linePos?: readonly { line: number }[] }[]): string[] =>
    errors.map((e) => `line ${e.linePos?.[0]?.line ?? '?'}: not valid YAML: ${e.message.split('\n')[0]}`);

/** The shape a data file must have. A field is required unless it says `optional`; unknown keys are allowed. */
export type Schema =
    | { readonly type: 'string' }
    | { readonly type: 'integer'; readonly min?: number; readonly max?: number }
    | { readonly type: 'boolean' }
    | { readonly type: 'enum'; readonly values: readonly string[] }
    | { readonly type: 'array'; readonly items: Schema }
    | { readonly type: 'object'; readonly fields: Readonly<Record<string, Field>> }
    | { readonly type: 'record'; readonly values: Schema }
    | { readonly type: 'any' };
export type Field = Schema & { readonly optional?: boolean };

const MAX_ERRORS = 20;

function validate(value: unknown, schema: Schema, at: string, errors: string[]): void {
    if (errors.length >= MAX_ERRORS) return;
    const fail = (message: string) => errors.push(`${at || 'the file'}: ${message}`);
    switch (schema.type) {
        case 'any':
            return;
        case 'string':
            if (typeof value !== 'string') fail('must be a string');
            return;
        case 'boolean':
            if (typeof value !== 'boolean') fail('must be true or false');
            return;
        case 'integer': {
            const range =
                schema.min !== undefined && schema.max !== undefined ? ` from ${schema.min} to ${schema.max}` : '';
            if (
                typeof value !== 'number' ||
                !Number.isInteger(value) ||
                (schema.min !== undefined && value < schema.min) ||
                (schema.max !== undefined && value > schema.max)
            )
                fail(`must be an integer${range}`);
            return;
        }
        case 'enum':
            if (typeof value !== 'string' || !schema.values.includes(value))
                fail(`must be one of ${schema.values.join(', ')}`);
            return;
        case 'array':
            if (!Array.isArray(value)) return void fail('must be a list');
            value.forEach((item, i) => validate(item, schema.items, `${at}[${i}]`, errors));
            return;
        case 'record':
            if (typeof value !== 'object' || value === null || Array.isArray(value)) return void fail('must be a map');
            for (const [key, item] of Object.entries(value)) validate(item, schema.values, `${at}.${key}`, errors);
            return;
        case 'object': {
            if (typeof value !== 'object' || value === null || Array.isArray(value)) return void fail('must be a map');
            const record = value as Record<string, unknown>;
            for (const [key, field] of Object.entries(schema.fields)) {
                const child = at ? `${at}.${key}` : key;
                if (record[key] === undefined || record[key] === null) {
                    if (!field.optional) errors.push(`${child}: missing`);
                    continue;
                }
                validate(record[key], field, child, errors);
            }
            return;
        }
    }
}

/** Every problem with a data file's text against its schema: parse errors with their line, then missing or wrong fields. */
export function checkData(text: string, schema: Schema): string[] {
    const doc = parseDocument(text, { uniqueKeys: true });
    if (doc.errors.length) return parseErrors(doc.errors).slice(0, MAX_ERRORS);
    const errors: string[] = [];
    validate(doc.toJS({ maxAliasCount: -1 }), schema, '', errors);
    return errors;
}

/** The same for a file; a missing file is one problem. */
export const checkFile = (file: string, schema: Schema): string[] =>
    fs.existsSync(file) ? checkData(fs.readFileSync(file, 'utf8'), schema) : [`${file}: the file was not written`];

const str: Field = { type: 'string' };
const optStr: Field = { type: 'string', optional: true };
const strings: Field = { type: 'array', items: { type: 'string' } };
const optStrings: Field = { ...strings, optional: true };
export const CONFIDENCE: Field = { type: 'integer', min: 0, max: 100 };
const TIER: Field = { type: 'enum', values: ['ERROR', 'WARN', 'INFO'] };

/** One spec-verify reader's findings file. */
export const READER_FINDINGS: Schema = {
    type: 'object',
    fields: {
        part: { type: 'integer', optional: true },
        reader: { type: 'integer', optional: true },
        capabilities: optStrings,
        findings: {
            type: 'array',
            items: {
                type: 'object',
                fields: {
                    kind: str,
                    tier: TIER,
                    where: str,
                    detail: str,
                    readerConfidence: CONFIDENCE,
                    quotes: {
                        type: 'array',
                        optional: true,
                        items: { type: 'object', fields: { file: str, line: { type: 'integer', min: 1 }, text: str } },
                    },
                },
            },
        },
        coverage: { type: 'record', values: { type: 'string' } },
        judged: strings,
        notes: optStrings,
    },
};

/** The spec-verify judge's verdict over one finding. */
export const JUDGE_VERDICT: Schema = {
    type: 'object',
    fields: {
        verdict: { type: 'enum', values: ['confirmed', 'warn'] },
        reason: str,
        scenario: optStr,
        judgeConfidence: CONFIDENCE,
    },
};

/** One spec-steward reader's findings file. */
export const STEWARD_FINDINGS: Schema = {
    type: 'object',
    fields: {
        findings: {
            type: 'array',
            items: {
                type: 'object',
                fields: {
                    file: str,
                    line: { type: 'integer', min: 1 },
                    quote: str,
                    ruleName: optStr,
                    criteria: { type: 'array', optional: true, items: { type: 'integer' } },
                    layer: str,
                    whatsWrong: str,
                    proposed: str,
                    evidence: optStrings,
                    crossRefs: optStrings,
                    themeKey: optStr,
                    needsHumanIntent: { type: 'boolean', optional: true },
                    reversesPastDecision: optStr,
                    readerConfidence: CONFIDENCE,
                },
            },
        },
        sound: optStrings,
        judged: optStrings,
        notes: optStrings,
    },
};

/** The spec-steward judge's verdict over one finding. */
export const STEWARD_VERDICT: Schema = {
    type: 'object',
    fields: {
        verdict: { type: 'enum', values: ['keep', 'revise', 'drop'] },
        reason: str,
        revised: { type: 'any', optional: true },
        judgeConfidence: CONFIDENCE,
    },
};

/** The report a skill-driven review (`spec-tools run <skill> --verdict <file>`) writes. */
export const REVIEW_REPORT: Schema = {
    type: 'object',
    fields: {
        title: optStr,
        findings: {
            type: 'array',
            items: {
                type: 'object',
                fields: {
                    tier: TIER,
                    where: str,
                    detail: str,
                    readerConfidence: CONFIDENCE,
                    fields: { type: 'record', optional: true, values: { type: 'string' } },
                },
            },
        },
        coverage: { type: 'object', fields: { complete: { type: 'boolean' }, notes: optStr } },
    },
};
