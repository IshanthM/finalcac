import { describe, expect, it } from 'vitest';
import { evaluateCalibration, type CalibrationRing } from '../src/dsp/calibration.ts';
import { parseProfile, toleranceFrac, withinTolerance, type TagProfile } from '../src/dsp/profile.ts';

const r = (freqHz: number, tauMs = 8): CalibrationRing => ({ freqHz, tauMs });

describe('evaluateCalibration', () => {
  it('is incomplete until five rings are in', () => {
    expect(evaluateCalibration([r(13300), r(13301)])).toEqual({ kind: 'incomplete', have: 2, need: 5 });
    expect(evaluateCalibration([r(13300), r(13301), r(13299), r(13300), null]).kind).toBe('incomplete');
  });

  it('accepts five agreeing rings and stores median, spread and decay', () => {
    const s = evaluateCalibration([r(13298, 7), r(13305, 8), r(13300, 9), r(13310, 8), r(13295, 8)]);
    expect(s.kind).toBe('ok');
    if (s.kind !== 'ok') return;
    expect(s.profile.freqHz).toBe(13300);
    expect(s.profile.spreadFrac).toBeCloseTo(10 / 13300, 6); // 13310 is the furthest from the median
    expect(s.profile.decayMs).toBe(8);
    expect(s.profile.rings).toHaveLength(5);
  });

  it('names the ring that is off, with direction and percentage', () => {
    const s = evaluateCalibration([r(13300), r(13302), r(13402), r(13299), r(13301)]);
    expect(s.kind).toBe('disagree');
    if (s.kind !== 'disagree') return;
    expect(s.offenders).toHaveLength(1);
    expect(s.offenders[0]!.index).toBe(2);
    expect(s.offenders[0]!.message).toBe('Ring 3 was 13,402 Hz, 0.76% high.');
  });

  it('lists the worst offender first and flags low rings', () => {
    const s = evaluateCalibration([r(13300), r(13200), r(13300), r(13380), r(13301)]);
    expect(s.kind).toBe('disagree');
    if (s.kind !== 'disagree') return;
    expect(s.offenders.map((o) => o.index)).toEqual([1, 3]);
    expect(s.offenders[0]!.message).toContain('low');
  });

  it('exactly 0.5% from the median still agrees', () => {
    const med = 13300;
    expect(evaluateCalibration([r(med), r(med), r(med), r(med * 1.005 - 0.01), r(med)]).kind).toBe('ok');
  });

  it('a redone ring replaces the offender and passes', () => {
    const rings: (CalibrationRing | null)[] = [r(13300), r(13302), r(13402), r(13299), r(13301)];
    rings[2] = null;
    expect(evaluateCalibration(rings).kind).toBe('incomplete');
    rings[2] = r(13298);
    expect(evaluateCalibration(rings).kind).toBe('ok');
  });
});

describe('tolerance', () => {
  it('is max(0.6%, 4 × spread), capped at 2.5%', () => {
    expect(toleranceFrac(0)).toBeCloseTo(0.006);
    expect(toleranceFrac(0.001)).toBeCloseTo(0.006);
    expect(toleranceFrac(0.002)).toBeCloseTo(0.008);
    expect(toleranceFrac(0.01)).toBeCloseTo(0.025);
  });

  const profile: TagProfile = { freqHz: 13300, spreadFrac: 0.002, decayMs: 8, sampleRate: 48000, calibratedAt: '2026-10-20', rings: [] };
  it('accepts inside and rejects outside, both sides', () => {
    expect(withinTolerance(13300 * 1.0079, profile)).toBe(true);
    expect(withinTolerance(13300 * 0.9921, profile)).toBe(true);
    expect(withinTolerance(13300 * 1.0081, profile)).toBe(false);
    expect(withinTolerance(13300 * 0.9919, profile)).toBe(false);
  });
});

describe('parseProfile', () => {
  const good = { freqHz: 13300, spreadFrac: 0.002, decayMs: 8, sampleRate: 48000, calibratedAt: '2026-10-20T00:00:00Z', rings: [13299, 13301] };
  it('round-trips a valid profile', () => {
    expect(parseProfile(JSON.parse(JSON.stringify(good)))).toEqual(good);
  });
  it('rejects junk', () => {
    for (const bad of [null, 5, {}, { ...good, freqHz: 100 }, { ...good, freqHz: NaN }, { ...good, spreadFrac: 0.5 }, { ...good, sampleRate: 1 }, { ...good, calibratedAt: 5 }]) {
      expect(parseProfile(bad)).toBeNull();
    }
  });
});
