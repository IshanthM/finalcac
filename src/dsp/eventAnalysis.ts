/**
 * Measure one tamper event from a recording: click length, ring frequency, ring length, decay.
 * Used by tools/analyze-wav.ts at Checkpoint 1 to set clickSkipMs / window bounds from real rings.
 * Pure: takes samples, returns numbers.
 */
import { RealFftPlan, type RealSignal } from './fft.ts';
import { hannWindow } from './window.ts';
import { PARAMS } from './params.ts';
import { refinePeak, type PeakResult } from './peak.ts';
import { toneSnrDb } from './snr.ts';
import { fitLine, narrowbandEnvelopeDb } from './envelope.ts';

export interface EventAnalysis {
  /** Refined onset (sample index into the analysed signal). */
  onsetIndex: number;
  onsetMs: number;
  peak: PeakResult | null;
  snrDb: number;
  /** How long energy away from the tone stays above its floor (the mechanical click), ms. */
  clickMs: number;
  /** How long the narrowband envelope at the peak stays within 6 dB of its floor, ms from onset. */
  ringMs: number;
  /** Amplitude e-fold time of the ringdown (ms); NaN if it can't be fitted. */
  tauMs: number;
  /** Time for the ring to fall 20 dB (ms); NaN if it can't be fitted. */
  decay20Ms: number;
  /** R² of the dB-vs-time fit; ringdown shape confidence. */
  decayR2: number;
  /** Ringdown window actually used for the final peak/SNR/guard (ms after the click skip): measured, then clamped. */
  windowMs: number;
  /** True if the envelope fell back to within eventEndDb of its floor inside the analysed span (a steady tone never does). */
  ringEnded: boolean;
  /** Height (dB) of the first post-click envelope frame above the envelope floor. */
  headroomDb: number;
  /** Fall (dB) of the envelope from its first frame after the click skip to the end of the ring. */
  dropDb: number;
  /** Contiguous 1 ms frames at/after the click skip that stay within 6 dB of the envelope floor. */
  ringFrames: number;
  /** 1 ms envelope at the peak, dB, from the onset. */
  envelopeDb: Float64Array;
  envelopeFloorDb: number;
}

export interface AnalysisOptions {
  clickSkipMs?: number;
  /** Window used for the peak estimate, ms after the click skip. */
  peakWindowMs?: number;
  maxRingMs?: number;
  /** Fraction around the peak excluded when measuring the broadband click. */
  toneExcludeFrac?: number;
}

const FRAME = 128;
const HOP = 32;
/** Off-tone energy this far below the in-band energy is treated as window leakage. */
const LEAKAGE_DB = 45;

function median(values: ArrayLike<number>): number {
  const a = Array.from(values).sort((x, y) => x - y);
  return a.length === 0 ? NaN : a[Math.floor(a.length / 2)]!;
}

/** Band energy track in dB for frames of FRAME samples every HOP, over bins accepted by `useBin`. */
function bandTrackDb(
  x: RealSignal,
  sampleRate: number,
  useBin: (hz: number) => boolean,
): { db: Float64Array; startOf: (i: number) => number } {
  const plan = RealFftPlan.forSize(FRAME);
  const w = hannWindow(FRAME).values;
  const power = new Float64Array(plan.binCount);
  const frame = new Float64Array(FRAME);
  const count = Math.max(0, Math.floor((x.length - FRAME) / HOP) + 1);
  const db = new Float64Array(count);
  const bins: number[] = [];
  for (let k = 1; k < plan.binCount - 1; k++) if (useBin((k * sampleRate) / FRAME)) bins.push(k);
  for (let f = 0; f < count; f++) {
    for (let i = 0; i < FRAME; i++) frame[i] = x[f * HOP + i]!;
    plan.power(frame, power, w);
    let e = 0;
    for (const k of bins) e += power[k]!;
    db[f] = 10 * Math.log10(e + 1e-30);
  }
  return { db, startOf: (i) => i * HOP };
}

/**
 * Analyse the event whose onset is near `approxOnset` (sample index; e.g. Onset.frameStart).
 * `x` should include ≥ 120 ms before and ≥ 150 ms after.
 */
export function analyzeEvent(
  x: RealSignal,
  sampleRate: number,
  approxOnset: number,
  opts: AnalysisOptions = {},
): EventAnalysis {
  const ms = (n: number): number => (n * 1000) / sampleRate;
  const samples = (msv: number): number => Math.round((msv * sampleRate) / 1000);
  const skipMs = opts.clickSkipMs ?? PARAMS.clickSkipMs;
  const peakWinMs = opts.peakWindowMs ?? 30;
  const maxRingMs = opts.maxRingMs ?? PARAMS.maxRingMs;
  const exclude = opts.toneExcludeFrac ?? 0.12;
  const { bandLoHz: lo, bandHiHz: hi } = PARAMS;

  // 1) Refine the onset on a fine in-band track.
  const inBand = bandTrackDb(x, sampleRate, (hz) => hz >= lo && hz <= hi);
  const preFrames = Math.max(0, Math.floor((approxOnset - FRAME * 2) / HOP));
  const floorDb = preFrames >= 8 ? median(inBand.db.subarray(0, preFrames)) : median(inBand.db.slice().sort().subarray(0, Math.max(1, Math.floor(inBand.db.length * 0.2))));
  // Look for the first fine frame above the floor near the detector's onset; if the broadband rise is too weak
  // (a narrowband ring in noise), trust the detector's own onset.
  const searchFrom = Math.max(0, Math.floor((approxOnset - FRAME * 2) / HOP));
  const searchTo = Math.min(inBand.db.length, searchFrom + Math.ceil((FRAME * 10) / HOP));
  let onsetFrame = searchFrom;
  while (onsetFrame < searchTo && inBand.db[onsetFrame]! < floorDb + PARAMS.onsetRiseDb) onsetFrame++;
  const refined = onsetFrame < searchTo;
  const onsetIndex = Math.min(x.length - 1, refined ? inBand.startOf(onsetFrame) + FRAME / 2 : Math.max(0, approxOnset));
  if (!refined) onsetFrame = searchFrom;

  // 2) Peak from the window after the click skip.
  const pStart = onsetIndex + samples(skipMs);
  const pEnd = Math.min(x.length, pStart + samples(peakWinMs));
  const peak = pEnd - pStart >= 32 ? refinePeak(x.subarray(pStart, pEnd), sampleRate) : null;

  // 3) SNR vs the 100 ms ending 5 ms before the onset.
  const nEnd = Math.max(0, onsetIndex - samples(5));
  const nStart = Math.max(0, nEnd - samples(PARAMS.noiseWindowMs));
  const noise = x.subarray(nStart, nEnd);
  const snrDb = peak ? toneSnrDb(peak.amplitude, peak.freqHz, noise, sampleRate) : -Infinity;

  // 4) Ring length and decay from a 1 ms narrowband envelope at the peak.
  const sub = Math.max(8, samples(1));
  let ringMs = 0, tauMs = NaN, decay20Ms = NaN, decayR2 = 0, envelopeFloorDb = NaN;
  let envelopeDb: Float64Array = new Float64Array(0);
  if (peak) {
    envelopeDb = narrowbandEnvelopeDb(x, sampleRate, peak.freqHz, onsetIndex, onsetIndex + samples(maxRingMs), sub);
    const noiseEnv = narrowbandEnvelopeDb(x, sampleRate, peak.freqHz, nStart, nEnd, sub);
    envelopeFloorDb = noiseEnv.length ? median(noiseEnv) : -Infinity;
    let last = -1;
    for (let i = 0; i < envelopeDb.length; i++) {
      if (envelopeDb[i]! >= envelopeFloorDb + PARAMS.eventEndDb) last = i;
      else break;
    }
    ringMs = ms((last + 1) * sub);
    const iDecay = Math.ceil(samples(skipMs) / sub);
    if (last - iDecay >= 2) {
      const ts: number[] = [], ys: number[] = [];
      for (let i = iDecay; i <= last; i++) { ts.push(ms(i * sub)); ys.push(envelopeDb[i]!); }
      const fit = fitLine(ts, ys);
      decayR2 = fit.r2;
      if (fit.slope < 0) {
        tauMs = 8.686 / -fit.slope;
        decay20Ms = 20 / -fit.slope;
      }
    }
  }

  // 4b) Second pass: analyse the window the ring actually occupies (clamped), not a fixed one.
  const i0 = Math.ceil(samples(skipMs) / sub);
  let lastFrame = -1;
  for (let i = 0; i < envelopeDb.length; i++) {
    if (envelopeDb[i]! >= envelopeFloorDb + PARAMS.eventEndDb) lastFrame = i;
    else break;
  }
  const ringFrames = Math.max(0, lastFrame - i0 + 1);
  const ringEnded = envelopeDb.length > 0 && lastFrame < envelopeDb.length - 1;
  const headroomDb = i0 < envelopeDb.length ? envelopeDb[i0]! - envelopeFloorDb : 0;
  const dropDb = lastFrame > i0 && i0 < envelopeDb.length ? envelopeDb[i0]! - envelopeDb[lastFrame]! : 0;
  const windowMs = Math.min(PARAMS.windowMaxMs, Math.max(PARAMS.windowMinMs, ringMs - skipMs));
  let finalPeak = peak;
  let finalSnr = snrDb;
  if (peak) {
    const wEnd = Math.min(x.length, pStart + samples(windowMs));
    if (wEnd - pStart >= 32) {
      const second = refinePeak(x.subarray(pStart, wEnd), sampleRate);
      if (second) {
        finalPeak = second;
        finalSnr = toneSnrDb(second.amplitude, second.freqHz, noise, sampleRate);
      }
    }
  }

  // 5) Click: energy away from the tone stays above its floor.
  let clickMs = 0;
  if (finalPeak) {
    const f0 = finalPeak.freqHz;
    const off = bandTrackDb(x, sampleRate, (hz) => hz >= lo && hz <= hi && Math.abs(hz - f0) > exclude * f0);
    const offFloor = preFrames >= 8 ? median(off.db.subarray(0, preFrames)) : floorDb;
    // The strong ring leaks through the Hann sidelobes into the off-tone bins; don't count that as click.
    const above = (i: number): boolean =>
      off.db[i]! >= Math.max(offFloor + PARAMS.eventEndDb, inBand.db[i]! - LEAKAGE_DB);
    let f = Math.max(0, onsetFrame - 2);
    // Start where the click starts (first frame above its floor), then run until it falls back.
    while (f < off.db.length && !above(f)) f++;
    const first = f;
    while (f < off.db.length && above(f)) f++;
    clickMs = ms((f - first) * HOP + FRAME);
  }

  return {
    onsetIndex, onsetMs: ms(onsetIndex), peak: finalPeak, snrDb: finalSnr, clickMs, ringMs, tauMs, decay20Ms, decayR2,
    windowMs, ringFrames, ringEnded, headroomDb, dropDb, envelopeDb, envelopeFloorDb,
  };
}
