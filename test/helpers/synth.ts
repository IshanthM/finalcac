import { createGaussian, createRandom } from '../../src/dsp/random.ts';

export interface RingSpec {
  sampleRate?: number;
  seconds?: number;
  /** Ring frequency (Hz) and amplitude-decay time constant (ms). */
  freqHz?: number;
  tauMs?: number;
  amp?: number;
  /** Time the ring (and click) starts (ms). */
  onsetMs?: number;
  /** Broadband click before/at the ring start: peak amplitude and length (ms). 0 = none. */
  clickAmp?: number;
  clickMs?: number;
  /** White noise RMS across the full band. */
  noiseRms?: number;
  seed?: number;
}

export function gaussianNoise(n: number, rms: number, seed: number): Float32Array {
  const g = createGaussian(createRandom(seed));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rms * g();
  return out;
}

/** Noise + optional click + exponentially decaying sine. Returns the signal and the onset sample. */
export function ringSignal(spec: RingSpec = {}): { x: Float32Array; onset: number; sampleRate: number } {
  const sr = spec.sampleRate ?? 48000;
  const n = Math.round((spec.seconds ?? 1) * sr);
  const f = spec.freqHz ?? 13300;
  const tau = ((spec.tauMs ?? 8) / 1000) * sr;
  const amp = spec.amp ?? 0.2;
  const onset = Math.round(((spec.onsetMs ?? 400) / 1000) * sr);
  const x = gaussianNoise(n, spec.noiseRms ?? 0.001, spec.seed ?? 1);
  const clickN = Math.round(((spec.clickMs ?? 0) / 1000) * sr);
  if ((spec.clickAmp ?? 0) > 0 && clickN > 0) {
    const g = createGaussian(createRandom((spec.seed ?? 1) + 99));
    for (let i = 0; i < clickN && onset + i < n; i++) {
      x[onset + i]! += spec.clickAmp! * g() * Math.exp(-i / (clickN / 3));
    }
  }
  for (let i = 0; onset + i < n; i++) {
    const env = Math.exp(-i / tau);
    if (env < 1e-5) break;
    x[onset + i]! += amp * env * Math.sin((2 * Math.PI * f * i) / sr);
  }
  return { x, onset, sampleRate: sr };
}
