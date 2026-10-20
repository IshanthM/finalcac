import { describe, expect, it } from 'vitest';
import { refinePeak } from '../src/dsp/peak.ts';
import { toneSnrDb } from '../src/dsp/snr.ts';
import { gaussianNoise } from './helpers/synth.ts';

function tone(n: number, f: number, amp: number, sr = 48000): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin((2 * Math.PI * f * i) / sr);
  return x;
}

describe('refinePeak', () => {
  it.each([13000, 13123.4, 13305, 13487.9, 13600])('locates a %f Hz tone to <0.05%% from 20 ms', (f) => {
    const p = refinePeak(tone(960, f, 0.3), 48000)!;
    expect(Math.abs(p.freqHz - f) / f).toBeLessThan(0.0005);
    expect(p.amplitude).toBeGreaterThan(0.27);
    expect(p.amplitude).toBeLessThan(0.33);
  });

  it('works at 44.1 kHz', () => {
    const p = refinePeak(tone(882, 13250, 0.3, 44100), 44100)!;
    expect(Math.abs(p.freqHz - 13250)).toBeLessThan(10);
  });

  it('gives a large guard margin for a clean tone and a small one for two close tones', () => {
    const clean = refinePeak(tone(2400, 13300, 0.3), 48000)!;
    expect(clean.guardMarginDb).toBeGreaterThan(30);
    const a = tone(2400, 13300, 0.3), b = tone(2400, 13300 * 1.03, 0.25);
    const mix = a.map((v, i) => v + b[i]!);
    expect(refinePeak(mix, 48000)!.guardMarginDb).toBeLessThan(6);
  });

  it('returns null when the band holds no bins', () => {
    expect(refinePeak(tone(256, 1000, 1), 48000, 30000, 31000)).toBeNull();
  });
});

describe('toneSnrDb', () => {
  it.each([6, 12, 20, 30])('estimates a %i dB SNR within 1.5 dB', (target) => {
    const sr = 48000;
    // Noise rms such that tone power (A^2/2) over noise power in ±1% of 13.3 kHz hits the target.
    const A = 0.2, f = 13300;
    const bw = 2 * 0.01 * f;
    const noisePower = (A * A) / 2 / 10 ** (target / 10);
    const rms = Math.sqrt((noisePower * (sr / 2)) / bw);
    const noise = gaussianNoise(4800, rms, 7);
    expect(Math.abs(toneSnrDb(A, f, noise, sr) - target)).toBeLessThan(1.5);
  });

  it('is +Infinity for silence and -Infinity for no tone', () => {
    expect(toneSnrDb(0.1, 13000, new Float32Array(4800), 48000)).toBe(Infinity);
    expect(toneSnrDb(0, 13000, gaussianNoise(4800, 0.01, 1), 48000)).toBe(-Infinity);
  });
});
