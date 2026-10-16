/**
 * How a finding is graded: a severity (0–100) and a confidence (0–100) from each reading — the reader's, and the
 * judge's when it ran — fused into one pair, and the pair turned into a tier by thresholds. Every audit that grades
 * defects (spec-verify, and the reviews `spec-tools verdict` reads) grades here, with the same variables.
 *
 * The fusion is a Kalman update with no process model: each reading is weighted by the inverse of its uncertainty,
 * `100 − confidence`, so the severity moves toward the more confident reading. The confidence is the more confident
 * reading's, less half the severity gap beyond `ignoreGap`: the readings share their evidence and their rules, so their
 * errors are not independent — a true update would make the pair surer than either reading — and readings that
 * disagree make it less sure; a gap within one band's width is noise, not disagreement.
 */

/** A finding is a sure ERROR only when its fused confidence is above this. */
export const SURE = 70;
/** An ERROR fails the run only when its fused confidence is above this; ERRORs at `SURE` to this exit 77, advisory. */
export const BLOCKING = 80;

export type Tier = 'ERROR' | 'WARN' | 'INFO';
/** One model's reading of a finding. */
export type Reading = { readonly severity: number; readonly confidence: number };
export type ReaderNumbers = 'hide' | 'show';

export type Thresholds = {
    /** The lowest severity of a WARN (`AUDIT_SEVERITY_WARN`). */
    readonly warn: number;
    /** The lowest severity of an ERROR (`AUDIT_SEVERITY_ERROR`). */
    readonly error: number;
    /** An ERROR needs a confidence above this (`AUDIT_CONFIDENCE_SURE`). */
    readonly sure: number;
    /** An ERROR fails the run at a confidence above this (`AUDIT_CONFIDENCE_BLOCKING`). */
    readonly blocking: number;
    /** The severity gap between two readings that costs the fused confidence nothing (`AUDIT_CONFIDENCE_IGNORE_GAP`). */
    readonly ignoreGap: number;
    /** A finding goes to the judge only at this severity or more (`AUDIT_JUDGE_FROM`). */
    readonly judgeFrom: number;
    /** …and only at this reader confidence or more (`AUDIT_JUDGE_MIN_CONFIDENCE`). */
    readonly judgeMinConfidence: number;
    /** Whether the judge's brief shows the reader's numbers (`AUDIT_JUDGE_READER_NUMBERS`). */
    readonly judgeReaderNumbers: ReaderNumbers;
};

/**
 * The defaults. `SURE` and `BLOCKING` keep their meaning from the tiers this scale replaced. The judge gate of 60: in
 * three corpus passes the judge rejected every ERROR candidate whose reader was less sure, and confirmed none of them.
 */
export const THRESHOLDS: Thresholds = {
    warn: 40,
    error: 70,
    sure: SURE,
    blocking: BLOCKING,
    ignoreGap: 20,
    judgeFrom: 70,
    judgeMinConfidence: 60,
    judgeReaderNumbers: 'hide',
};

/** The thresholds from the variables, validated; an unset or empty one takes its default. */
export function thresholds(env: NodeJS.ProcessEnv = process.env): Thresholds {
    const score = (name: string, fallback: number): number => {
        const value = env[name];
        if (!value) return fallback;
        if (!/^\d+$/.test(value) || Number(value) > 100)
            throw new Error(`${name} must be a whole number from 0 to 100, not "${value}"`);
        return Number(value);
    };
    const numbers = env.AUDIT_JUDGE_READER_NUMBERS || THRESHOLDS.judgeReaderNumbers;
    if (numbers !== 'hide' && numbers !== 'show')
        throw new Error(`AUDIT_JUDGE_READER_NUMBERS must be hide or show, not "${numbers}"`);
    const t: Thresholds = {
        warn: score('AUDIT_SEVERITY_WARN', THRESHOLDS.warn),
        error: score('AUDIT_SEVERITY_ERROR', THRESHOLDS.error),
        sure: score('AUDIT_CONFIDENCE_SURE', THRESHOLDS.sure),
        blocking: score('AUDIT_CONFIDENCE_BLOCKING', THRESHOLDS.blocking),
        ignoreGap: score('AUDIT_CONFIDENCE_IGNORE_GAP', THRESHOLDS.ignoreGap),
        judgeFrom: score('AUDIT_JUDGE_FROM', THRESHOLDS.judgeFrom),
        judgeMinConfidence: score('AUDIT_JUDGE_MIN_CONFIDENCE', THRESHOLDS.judgeMinConfidence),
        judgeReaderNumbers: numbers,
    };
    if (t.warn >= t.error)
        throw new Error(`AUDIT_SEVERITY_WARN (${t.warn}) must be below AUDIT_SEVERITY_ERROR (${t.error})`);
    if (t.sure > t.blocking)
        throw new Error(
            `AUDIT_CONFIDENCE_SURE (${t.sure}) must not be above AUDIT_CONFIDENCE_BLOCKING (${t.blocking})`,
        );
    return t;
}

/** The thresholds as one line, for the reports that say what a run graded by. */
export const describeThresholds = (t: Thresholds): string =>
    `WARN from severity ${t.warn}, ERROR from ${t.error} above ${t.sure}% confidence, FAIL above ${t.blocking}%; a severity gap up to ${t.ignoreGap} between readings costs no confidence`;

/** One or two readings fused into one; with one reading, that reading. A severity gap up to `ignoreGap` costs nothing. */
export function fuse(readings: readonly Reading[], ignoreGap: number = THRESHOLDS.ignoreGap): Reading {
    const uncertainty = readings.map((r) => Math.max(1, 100 - r.confidence));
    const weight = uncertainty.reduce((sum, u) => sum + 1 / u, 0);
    const severity = readings.reduce((sum, r, i) => sum + r.severity / uncertainty[i]!, 0) / weight;
    const severities = readings.map((r) => r.severity);
    const gap = Math.max(0, Math.max(...severities) - Math.min(...severities) - ignoreGap);
    const confidence = 100 - Math.min(...uncertainty) - gap / 2;
    return { severity: Math.round(severity), confidence: Math.round(Math.min(100, Math.max(0, confidence))) };
}

/** The tier of a fused pair: ERROR needs the severity and a confidence above `sure`; a severe but unsure pair is WARN. */
export const tierOf = (r: Reading, t: Thresholds): Tier =>
    r.severity >= t.error && r.confidence > t.sure ? 'ERROR' : r.severity >= t.warn ? 'WARN' : 'INFO';

/** Whether a reader's (capped) reading goes to the judge. */
export const isJudged = (r: Reading, t: Thresholds): boolean =>
    r.severity >= t.judgeFrom && r.confidence >= t.judgeMinConfidence;

/** The findings the judge reads, and how many each gate held back: severe but unsure, and below the severity. */
export function judgeGate<T extends Reading>(
    findings: readonly T[],
    t: Thresholds,
): { judged: T[]; unsure: number; mild: number } {
    const severe = findings.filter((f) => f.severity >= t.judgeFrom);
    const judged = severe.filter((f) => isJudged(f, t));
    return { judged, unsure: severe.length - judged.length, mild: findings.length - severe.length };
}
