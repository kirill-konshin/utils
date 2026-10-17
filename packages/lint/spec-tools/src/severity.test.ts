import { describe, expect, test } from 'vite-plus/test';

import { fuse, judgeGate, type Reading, THRESHOLDS, thresholds, tierOf } from './severity';

const r = (severity: number, confidence: number): Reading => ({ severity, confidence });

describe('fuse', () => {
    test('is the one reading when there is one', () => {
        expect(fuse([r(80, 75)])).toEqual(r(80, 75));
    });

    test('moves the severity toward the more confident reading, and is never surer than the surer reading', () => {
        const fused = fuse([r(75, 70), r(85, 78)]);
        expect(fused).toEqual(r(81, 78));
        expect(fuse([r(75, 70), r(85, 78)], 0)).toEqual(r(81, 73));
        expect(fuse([r(90, 85), r(90, 85)])).toEqual(r(90, 85));
    });

    test('is less sure the more the readings disagree beyond the gap it ignores', () => {
        expect(fuse([r(75, 55), r(35, 75)])).toEqual(r(49, 65));
        expect(fuse([r(75, 55), r(35, 75)], 0)).toEqual(r(49, 55));
        expect(fuse([r(100, 100), r(0, 100)]).confidence).toBe(59);
        expect(fuse([r(80, 90), r(100, 90)]).confidence).toBe(90);
        expect(fuse([r(80, 90), r(100, 90)], 10).confidence).toBe(85);
    });

    test('gives the plan’s examples their tiers', () => {
        const tier = (...readings: Reading[]) => tierOf(fuse(readings), THRESHOLDS);
        expect(tier(r(75, 70), r(85, 78))).toBe('ERROR');
        expect(tier(r(75, 55), r(35, 75))).toBe('WARN');
        expect(fuse([r(95, 95), r(40, 60)])).toEqual(r(89, 78));
        expect(tier(r(95, 95), r(40, 60))).toBe('ERROR');
        expect(fuse([r(90, 85), r(92, 90)])).toEqual(r(91, 90));
        expect(fuse([r(90, 90), r(78, 76)])).toEqual(r(86, 90));
    });
});

describe('tierOf', () => {
    test('is ERROR from the ERROR severity above the SURE confidence, WARN from the WARN severity, INFO below', () => {
        expect(tierOf(r(70, 71), THRESHOLDS)).toBe('ERROR');
        expect(tierOf(r(69, 99), THRESHOLDS)).toBe('WARN');
        expect(tierOf(r(70, 70), THRESHOLDS)).toBe('WARN');
        expect(tierOf(r(40, 10), THRESHOLDS)).toBe('WARN');
        expect(tierOf(r(39, 99), THRESHOLDS)).toBe('INFO');
    });
});

describe('judgeGate', () => {
    test('sends the judge a finding severe and sure enough, and counts what each gate held back', () => {
        const gate = judgeGate([r(80, 60), r(80, 59), r(69, 99), r(70, 90)], THRESHOLDS);
        expect(gate).toEqual({ judged: [r(80, 60), r(70, 90)], unsure: 1, mild: 1 });
        expect(judgeGate([r(50, 90)], { ...THRESHOLDS, judgeFrom: 40 }).judged).toEqual([r(50, 90)]);
    });
});

describe('thresholds', () => {
    test('takes the defaults when nothing is set, and each variable when it is', () => {
        expect(thresholds({})).toEqual(THRESHOLDS);
        expect(
            thresholds({
                AUDIT_SEVERITY_WARN: '30',
                AUDIT_SEVERITY_ERROR: '80',
                AUDIT_CONFIDENCE_SURE: '60',
                AUDIT_CONFIDENCE_BLOCKING: '90',
                AUDIT_CONFIDENCE_IGNORE_GAP: '0',
                AUDIT_JUDGE_FROM: '50',
                AUDIT_JUDGE_MIN_CONFIDENCE: '0',
                AUDIT_JUDGE_READER_NUMBERS: 'show',
            }),
        ).toEqual({
            warn: 30,
            error: 80,
            sure: 60,
            blocking: 90,
            ignoreGap: 0,
            judgeFrom: 50,
            judgeMinConfidence: 0,
            judgeReaderNumbers: 'show',
        });
    });

    test('refuses a value it cannot use, naming the variable', () => {
        expect(() => thresholds({ AUDIT_SEVERITY_ERROR: '101' })).toThrow(/AUDIT_SEVERITY_ERROR/);
        expect(() => thresholds({ AUDIT_JUDGE_MIN_CONFIDENCE: '0.6' })).toThrow(/AUDIT_JUDGE_MIN_CONFIDENCE/);
        expect(() => thresholds({ AUDIT_JUDGE_READER_NUMBERS: 'yes' })).toThrow(/AUDIT_JUDGE_READER_NUMBERS/);
        expect(() => thresholds({ AUDIT_SEVERITY_WARN: '70' })).toThrow(/below AUDIT_SEVERITY_ERROR/);
        expect(() => thresholds({ AUDIT_CONFIDENCE_SURE: '90' })).toThrow(/AUDIT_CONFIDENCE_BLOCKING/);
    });
});
