/**
 * The decision: does one analysed event count as a tag tamper? Pure.
 * Gates (all must pass): SNR, narrowband guard, exponential-ish ringdown, frequency tolerance.
 */
import type { EventAnalysis } from './eventAnalysis.ts';
import { PARAMS } from './params.ts';
import { deviationFrac, toleranceFrac, type TagProfile } from './profile.ts';

export type GateName = 'snr' | 'guard' | 'decay' | 'tolerance';

export interface Gate {
  pass: boolean;
  /** Measured value and the limit it was compared with (units depend on the gate). */
  value: number;
  limit: number;
  /** Human-readable summary, e.g. "SNR 8.2 dB < 12 dB". */
  text: string;
}

export interface Verdict {
  accepted: boolean;
  gates: Record<GateName, Gate>;
  failed: GateName[];
  freqHz: number | null;
  /** Signed deviation from the profile (fraction); null when uncalibrated or no peak. */
  deviationFrac: number | null;
}

const fmt = (v: number, d = 1): string => (Number.isFinite(v) ? v.toFixed(d) : v > 0 ? '∞' : '−∞');

/**
 * `skipTolerance` is for calibration rings: every gate except the frequency match applies.
 * Without a profile (and not skipping), the tolerance gate fails with "not calibrated".
 */
export function judgeEvent(a: EventAnalysis, profile: TagProfile | null, opts: { skipTolerance?: boolean } = {}): Verdict {
  const p = a.peak;
  const snrOk = p !== null && a.snrDb >= PARAMS.snrGateDb;
  const guardOk = p !== null && p.guardMarginDb >= PARAMS.guardMarginDb;
  const decayOk =
    p !== null && Number.isFinite(a.tauMs) && (a.decayR2 >= PARAMS.decayR2Min || a.headroomDb < PARAMS.r2HeadroomDb) && a.ringFrames >= PARAMS.minRingFrames &&
    a.ringEnded && a.dropDb >= PARAMS.minDropDb;

  let tolPass = false, tolValue = NaN, tolText = 'not calibrated';
  const limit = profile ? toleranceFrac(profile.spreadFrac) : PARAMS.tolMinFrac;
  let dev: number | null = null;
  if (p && profile) {
    dev = deviationFrac(p.freqHz, profile);
    tolValue = Math.abs(dev);
    tolPass = tolValue <= limit;
    tolText = `${fmt(p.freqHz, 0)} Hz is ${fmt(dev * 100, 2)}% from ${fmt(profile.freqHz, 0)} Hz (limit ±${fmt(limit * 100, 2)}%)`;
  }
  if (opts.skipTolerance) { tolPass = true; tolText = 'skipped (calibrating)'; }

  const gates: Record<GateName, Gate> = {
    snr: { pass: snrOk, value: a.snrDb, limit: PARAMS.snrGateDb, text: `SNR ${fmt(a.snrDb)} dB ${snrOk ? '≥' : '<'} ${PARAMS.snrGateDb} dB` },
    guard: {
      pass: guardOk, value: p?.guardMarginDb ?? NaN, limit: PARAMS.guardMarginDb,
      text: `guard ${p ? fmt(p.guardMarginDb) : '—'} dB ${guardOk ? '≥' : '<'} ${PARAMS.guardMarginDb} dB`,
    },
    decay: {
      pass: decayOk, value: a.decayR2, limit: PARAMS.decayR2Min,
      text: `ringdown R² ${fmt(a.decayR2, 2)} (≥ ${PARAMS.decayR2Min} when headroom ${fmt(a.headroomDb, 0)} dB ≥ ${PARAMS.r2HeadroomDb}), ${a.ringFrames} frames (≥ ${PARAMS.minRingFrames}), ${a.ringEnded ? 'ended' : 'did not end'}, fell ${fmt(a.dropDb)} dB (≥ ${PARAMS.minDropDb})`,
    },
    tolerance: { pass: tolPass, value: tolValue, limit, text: tolText },
  };
  const failed = (Object.keys(gates) as GateName[]).filter((g) => !gates[g].pass);
  return { accepted: failed.length === 0, gates, failed, freqHz: p?.freqHz ?? null, deviationFrac: dev };
}
