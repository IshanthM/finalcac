/** Tone-vs-noise SNR in a narrow band around the tone. Pure. */
import { RealFftPlan, type RealSignal } from './fft.ts';
import { hannWindow } from './window.ts';
import { PARAMS } from './params.ts';

/**
 * One-sided noise power spectral density (power per Hz) averaged over `[loHz, hiHz]`,
 * from 50%-overlapped Hann frames of `frameSize`. Returns 0 for a segment shorter than one frame.
 */
export function noisePsd(noise: RealSignal, sampleRate: number, loHz: number, hiHz: number, frameSize = 512): number {
  if (noise.length < frameSize) return 0;
  const plan = RealFftPlan.forSize(frameSize);
  const w = hannWindow(frameSize);
  const power = new Float64Array(plan.binCount);
  const frame = new Float64Array(frameSize);
  const binHz = sampleRate / frameSize;
  let k0 = Math.ceil(loHz / binHz);
  let k1 = Math.floor(hiHz / binHz);
  if (k1 < k0) {
    // Band narrower than one bin: use the nearest bin.
    k0 = k1 = Math.round((loHz + hiHz) / 2 / binHz);
  }
  const hop = frameSize / 2;
  let sum = 0;
  let count = 0;
  for (let start = 0; start + frameSize <= noise.length; start += hop) {
    for (let i = 0; i < frameSize; i++) frame[i] = noise[start + i]!;
    plan.power(frame, power, w.values);
    for (let k = k0; k <= k1; k++) {
      sum += power[k]!;
      count++;
    }
  }
  if (count === 0) return 0;
  return (2 * (sum / count)) / (sampleRate * w.sumOfSquares);
}

/**
 * SNR (dB) of a tone of estimated `amplitude` at `freqHz` over the pre-onset `noise` segment:
 * tone power A^2/2 against noise power in ±`bandFrac`·f.
 * Returns -Infinity when there is no tone and +Infinity when the noise segment is silent.
 */
export function toneSnrDb(
  amplitude: number,
  freqHz: number,
  noise: RealSignal,
  sampleRate: number,
  bandFrac: number = PARAMS.snrBandFrac,
): number {
  const tonePower = (amplitude * amplitude) / 2;
  if (tonePower <= 0) return -Infinity;
  const lo = freqHz * (1 - bandFrac);
  const hi = freqHz * (1 + bandFrac);
  const noisePower = noisePsd(noise, sampleRate, lo, hi) * (hi - lo);
  if (noisePower <= 0) return Infinity;
  return 10 * Math.log10(tonePower / noisePower);
}
