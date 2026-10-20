/** Calibration: five rings must agree; the median becomes the store's tag profile. Pure. */
import { PARAMS } from './params.ts';
import type { TagProfile } from './profile.ts';

export interface CalibrationRing {
  freqHz: number;
  /** Amplitude e-fold time (ms) of this ring; NaN if unknown. */
  tauMs: number;
}

export interface Offender {
  /** 0-based ring index. */
  index: number;
  freqHz: number;
  /** Signed deviation from the median (fraction). */
  deviationFrac: number;
  /** "Ring 3 was 13,402 Hz, 0.70% high." */
  message: string;
}

export type CalibrationStatus =
  | { kind: 'incomplete'; have: number; need: number }
  | { kind: 'ok'; profile: Omit<TagProfile, 'sampleRate' | 'calibratedAt'> }
  | { kind: 'disagree'; median: number; offenders: Offender[] };

function median(values: number[]): number {
  const a = [...values].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

const hz = (v: number): string => Math.round(v).toLocaleString('en-US');

/**
 * `rings` has one entry per ring taken so far (null = a slot the user is redoing).
 * With all `calibRings` filled: if any ring is more than calibAgreeFrac from the median, name the offenders;
 * otherwise return the profile (median frequency, spread = largest deviation, median decay).
 */
export function evaluateCalibration(rings: (CalibrationRing | null)[], need: number = PARAMS.calibRings): CalibrationStatus {
  const have = rings.filter((r): r is CalibrationRing => r !== null);
  if (rings.length < need || have.length < need) return { kind: 'incomplete', have: have.length, need };
  const med = median(have.map((r) => r.freqHz));
  const offenders: Offender[] = [];
  let spread = 0;
  rings.forEach((r, index) => {
    if (!r) return;
    const dev = (r.freqHz - med) / med;
    spread = Math.max(spread, Math.abs(dev));
    if (Math.abs(dev) > PARAMS.calibAgreeFrac) {
      offenders.push({
        index,
        freqHz: r.freqHz,
        deviationFrac: dev,
        message: `Ring ${index + 1} was ${hz(r.freqHz)} Hz, ${(Math.abs(dev) * 100).toFixed(2)}% ${dev > 0 ? 'high' : 'low'}.`,
      });
    }
  });
  if (offenders.length > 0) {
    // Only the single worst ring must be redone first: redoing it moves the median.
    offenders.sort((a, b) => Math.abs(b.deviationFrac) - Math.abs(a.deviationFrac));
    return { kind: 'disagree', median: med, offenders };
  }
  const taus = have.map((r) => r.tauMs).filter(Number.isFinite);
  return {
    kind: 'ok',
    profile: { freqHz: med, spreadFrac: spread, decayMs: taus.length ? median(taus) : 0, rings: have.map((r) => r.freqHz) },
  };
}
