/** Narrowband envelope and linear dB fit. Pure. */
import type { RealSignal } from './fft.ts';

/**
 * Power (dB) of `samples` at `freqHz` in consecutive sub-frames of `subFrame` samples,
 * via Goertzel with a Hann taper. Returns one value per full sub-frame starting at `start`.
 */
export function narrowbandEnvelopeDb(
  samples: RealSignal,
  sampleRate: number,
  freqHz: number,
  start: number,
  end: number,
  subFrame: number,
): Float64Array {
  const count = Math.max(0, Math.floor((Math.min(end, samples.length) - start) / subFrame));
  const out = new Float64Array(count);
  const w = 2 * Math.PI * freqHz / sampleRate;
  const taper = new Float64Array(subFrame);
  let wsum = 0;
  for (let i = 0; i < subFrame; i++) {
    taper[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / subFrame);
    wsum += taper[i]!;
  }
  for (let f = 0; f < count; f++) {
    const base = start + f * subFrame;
    let re = 0;
    let im = 0;
    for (let i = 0; i < subFrame; i++) {
      const x = samples[base + i]! * taper[i]!;
      re += x * Math.cos(w * i);
      im -= x * Math.sin(w * i);
    }
    const amp = (2 * Math.hypot(re, im)) / wsum;
    out[f] = 20 * Math.log10(Math.max(amp, 1e-15));
  }
  return out;
}

export interface LineFit {
  slope: number;
  intercept: number;
  r2: number;
}

/** Least-squares line y = intercept + slope·x. */
export function fitLine(xs: ArrayLike<number>, ys: ArrayLike<number>): LineFit {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: n === 1 ? ys[0]! : 0, r2: 0 };
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]!; sy += ys[i]!; }
  const mx = sx / n, my = sy / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx, dy = ys[i]! - my;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const r2 = sxx === 0 || syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  return { slope, intercept: my - slope * mx, r2 };
}
