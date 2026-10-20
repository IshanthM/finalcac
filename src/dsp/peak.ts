/** Peak finding: zero-padded Hann FFT, parabolic refinement, narrowband guard. Pure. */
import { RealFftPlan, type RealSignal } from './fft.ts';
import { hannWindow } from './window.ts';
import { PARAMS } from './params.ts';

export interface PeakResult {
  /** Refined peak frequency (Hz). */
  freqHz: number;
  /** Peak bin power (dB, arbitrary reference; compare within one call only). */
  powerDb: number;
  /** Estimated sinusoid amplitude (same units as the samples; underestimates a decaying tone). */
  amplitude: number;
  /** Peak minus the strongest bin in the 2-4% ranges below and above (dB). Infinity if the ranges are empty. */
  guardMarginDb: number;
  guardLowDb: number;
  guardHighDb: number;
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** Power spectrum (raw |X|^2) of `samples` under a Hann window, zero-padded to `fftSize`. */
export function paddedHannPower(samples: RealSignal, fftSize: number): { power: Float64Array; windowSum: number } {
  const n = samples.length;
  if (n < 4) throw new RangeError('need at least 4 samples');
  if (fftSize < n) throw new RangeError('fftSize must be >= samples.length');
  const w = hannWindow(n);
  const padded = new Float64Array(fftSize);
  for (let i = 0; i < n; i++) padded[i] = samples[i]! * w.values[i]!;
  const power = new Float64Array(fftSize / 2 + 1);
  RealFftPlan.forSize(fftSize).power(padded, power);
  return { power, windowSum: w.sum };
}

const toDb = (p: number): number => 10 * Math.log10(Math.max(p, 1e-30));

/**
 * Strongest peak of `samples` inside [loHz, hiHz].
 * Returns null if the range holds no bins.
 */
export function refinePeak(
  samples: RealSignal,
  sampleRate: number,
  loHz: number = PARAMS.bandLoHz,
  hiHz: number = PARAMS.bandHiHz,
  fftSize: number = Math.max(PARAMS.peakFftSize, nextPowerOfTwo(samples.length)),
): PeakResult | null {
  const { power, windowSum } = paddedHannPower(samples, fftSize);
  const binHz = sampleRate / fftSize;
  const kLo = Math.max(1, Math.ceil(loHz / binHz));
  const kHi = Math.min(power.length - 2, Math.floor(hiHz / binHz));
  if (kHi < kLo) return null;
  let k = kLo;
  for (let i = kLo; i <= kHi; i++) if (power[i]! > power[k]!) k = i;
  const a = Math.log(Math.max(power[k - 1]!, 1e-30));
  const b = Math.log(Math.max(power[k]!, 1e-30));
  const c = Math.log(Math.max(power[k + 1]!, 1e-30));
  const denom = a - 2 * b + c;
  const delta = denom === 0 ? 0 : Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom));
  const freqHz = (k + delta) * binHz;
  const peakP = power[k]!;
  const maxIn = (f0: number, f1: number): number => {
    const i0 = Math.max(1, Math.ceil(f0 / binHz));
    const i1 = Math.min(power.length - 1, Math.floor(f1 / binHz));
    let m = 0;
    for (let i = i0; i <= i1; i++) if (power[i]! > m) m = power[i]!;
    return m;
  };
  const { guardInner: gi, guardOuter: go } = PARAMS;
  const lowP = maxIn(freqHz * (1 - go), freqHz * (1 - gi));
  const highP = maxIn(freqHz * (1 + gi), freqHz * (1 + go));
  const guardLowDb = lowP > 0 ? toDb(peakP) - toDb(lowP) : Infinity;
  const guardHighDb = highP > 0 ? toDb(peakP) - toDb(highP) : Infinity;
  return {
    freqHz,
    powerDb: toDb(peakP),
    amplitude: (2 * Math.sqrt(peakP)) / windowSum,
    guardMarginDb: Math.min(guardLowDb, guardHighDb),
    guardLowDb,
    guardHighDb,
  };
}
