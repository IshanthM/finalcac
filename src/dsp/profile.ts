/** The store's tag profile: what calibration learned about the tags. Pure. */
import { PARAMS } from './params.ts';

export interface TagProfile {
  /** Median ring frequency (Hz). */
  freqHz: number;
  /** Largest deviation of any calibration ring from the median (fraction of freqHz). */
  spreadFrac: number;
  /** Median amplitude e-fold time (ms); NaN-free (0 if unknown). */
  decayMs: number;
  /** Sample rate the profile was measured at (Hz). */
  sampleRate: number;
  /** ISO timestamp. */
  calibratedAt: string;
  /** The individual calibration ring frequencies (Hz). */
  rings: number[];
}

/** Accept ± max(0.6%, 4 × spread), capped at 2.5%. */
export function toleranceFrac(spreadFrac: number): number {
  return Math.min(PARAMS.tolMaxFrac, Math.max(PARAMS.tolMinFrac, PARAMS.tolSpreadMult * spreadFrac));
}

/** Signed deviation of `freqHz` from the profile, as a fraction of the profile frequency. */
export function deviationFrac(freqHz: number, profile: TagProfile): number {
  return (freqHz - profile.freqHz) / profile.freqHz;
}

export function withinTolerance(freqHz: number, profile: TagProfile): boolean {
  return Math.abs(deviationFrac(freqHz, profile)) <= toleranceFrac(profile.spreadFrac);
}

/** Validates untrusted JSON (localStorage, network) into a profile or null. */
export function parseProfile(raw: unknown): TagProfile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!num(r.freqHz) || r.freqHz < 5000 || r.freqHz > 24000) return null;
  if (!num(r.spreadFrac) || r.spreadFrac < 0 || r.spreadFrac > 0.1) return null;
  if (!num(r.decayMs) || r.decayMs < 0 || r.decayMs > 10000) return null;
  if (!num(r.sampleRate) || r.sampleRate < 8000 || r.sampleRate > 192000) return null;
  if (typeof r.calibratedAt !== 'string' || r.calibratedAt.length > 40) return null;
  const rings = Array.isArray(r.rings) ? r.rings.filter(num).slice(0, 20) : [];
  return { freqHz: r.freqHz, spreadFrac: r.spreadFrac, decayMs: r.decayMs, sampleRate: r.sampleRate, calibratedAt: r.calibratedAt, rings };
}
