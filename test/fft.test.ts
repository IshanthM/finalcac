import { describe, expect, it } from 'vitest';
import { FftPlan, RealFftPlan, isPowerOfTwo } from '../src/dsp/fft.ts';
import { hannWindow } from '../src/dsp/window.ts';
import { createRandom } from '../src/dsp/random.ts';
import { argMax, naiveDft, powersOfTwo, relativeError, sinusoid } from './helpers/signals.ts';

const SIZES = powersOfTwo(8, 4096);

function randomVector(length: number, seed: number): Float64Array {
  const random = createRandom(seed);
  const out = new Float64Array(length);
  for (let i = 0; i < length; i++) out[i] = 2 * random() - 1;
  return out;
}

describe('isPowerOfTwo', () => {
  it('accepts powers of two and rejects everything else', () => {
    for (const n of [1, 2, 4, 1024, 2 ** 30]) expect(isPowerOfTwo(n)).toBe(true);
    for (const n of [0, -2, 3, 6, 1000, 2.5, 2 ** 31, Number.NaN]) expect(isPowerOfTwo(n)).toBe(false);
  });
});

describe('FftPlan (complex radix-2)', () => {
  it.each(SIZES)('matches a naive DFT on random input, N = %i', (n) => {
    const re = randomVector(n, n);
    const im = randomVector(n, n + 7919);
    const reference = naiveDft(re, im);
    FftPlan.forSize(n).forward(re, im);
    expect(relativeError(re, im, reference.re, reference.im)).toBeLessThan(1e-9);
  });

  it('handles the trivial sizes 1 and 2', () => {
    const re1 = new Float64Array([3]);
    const im1 = new Float64Array([-2]);
    FftPlan.forSize(1).forward(re1, im1);
    expect([re1[0], im1[0]]).toEqual([3, -2]);

    const re2 = new Float64Array([1, 2]);
    const im2 = new Float64Array([0, 0]);
    FftPlan.forSize(2).forward(re2, im2);
    expect(Array.from(re2)).toEqual([3, -1]);
  });

  it.each([16, 1024, 4096])('inverts its own forward transform, N = %i', (n) => {
    const re = randomVector(n, 11);
    const im = randomVector(n, 12);
    const originalRe = re.slice();
    const originalIm = im.slice();
    const plan = FftPlan.forSize(n);
    plan.forward(re, im);
    plan.inverse(re, im);
    expect(relativeError(re, im, originalRe, originalIm)).toBeLessThan(1e-13);
  });

  it.each(SIZES)('satisfies Parseval: sum |x|^2 = (1/N) sum |X|^2, N = %i', (n) => {
    const re = randomVector(n, 3 * n);
    const im = randomVector(n, 5 * n);
    let timeEnergy = 0;
    for (let i = 0; i < n; i++) timeEnergy += re[i]! ** 2 + im[i]! ** 2;
    FftPlan.forSize(n).forward(re, im);
    let freqEnergy = 0;
    for (let i = 0; i < n; i++) freqEnergy += re[i]! ** 2 + im[i]! ** 2;
    expect(Math.abs(freqEnergy / n - timeEnergy) / timeEnergy).toBeLessThan(1e-12);
  });

  it('caches plans and rejects bad sizes and buffer lengths', () => {
    expect(FftPlan.forSize(256)).toBe(FftPlan.forSize(256));
    expect(FftPlan.forSize(256).log2Size).toBe(8);
    for (const bad of [0, 3, 1000, -8, 2 ** 31]) expect(() => FftPlan.forSize(bad)).toThrow(RangeError);
    const plan = FftPlan.forSize(8);
    expect(() => {
      plan.forward(new Float64Array(8), new Float64Array(4));
    }).toThrow(RangeError);
  });
});

describe('RealFftPlan (real input, bins 0..N/2)', () => {
  it.each([2, 4, ...SIZES])('matches a naive DFT on random real input, N = %i', (n) => {
    const x = randomVector(n, 101 + n);
    const reference = naiveDft(x, new Float64Array(n));
    const plan = RealFftPlan.forSize(n);
    const outRe = new Float64Array(plan.binCount);
    const outIm = new Float64Array(plan.binCount);
    plan.forward(x, outRe, outIm);
    expect(plan.binCount).toBe(n / 2 + 1);
    expect(relativeError(outRe, outIm, reference.re, reference.im, n / 2 + 1)).toBeLessThan(1e-9);
  });

  it.each(SIZES)('power() equals |naive DFT|^2, N = %i', (n) => {
    const x = randomVector(n, 7 * n);
    const reference = naiveDft(x, new Float64Array(n));
    const plan = RealFftPlan.forSize(n);
    const power = new Float64Array(plan.binCount);
    plan.power(x, power);
    let diff = 0;
    let ref = 0;
    for (let k = 0; k <= n / 2; k++) {
      const expected = reference.re[k]! ** 2 + reference.im[k]! ** 2;
      diff += (power[k]! - expected) ** 2;
      ref += expected ** 2;
    }
    expect(Math.sqrt(diff / ref)).toBeLessThan(1e-9);
  });

  it.each(SIZES)('satisfies Parseval on the one-sided spectrum, N = %i', (n) => {
    const x = randomVector(n, 13 * n);
    let timeEnergy = 0;
    for (let i = 0; i < n; i++) timeEnergy += x[i]! ** 2;
    const plan = RealFftPlan.forSize(n);
    const power = new Float64Array(plan.binCount);
    plan.power(x, power);
    // Interior bins appear twice in the full spectrum (k and N-k); DC and Nyquist once.
    let freqEnergy = power[0]! + power[n / 2]!;
    for (let k = 1; k < n / 2; k++) freqEnergy += 2 * power[k]!;
    expect(Math.abs(freqEnergy / n - timeEnergy) / timeEnergy).toBeLessThan(1e-12);
  });

  it('puts a constant entirely in the DC bin and an alternating sequence in the Nyquist bin', () => {
    const n = 1024;
    const plan = RealFftPlan.forSize(n);
    const power = new Float64Array(plan.binCount);

    plan.power(new Float64Array(n).fill(0.25), power);
    expect(power[0]).toBeCloseTo((0.25 * n) ** 2, 6);
    for (let k = 1; k <= n / 2; k++) expect(power[k]).toBeLessThan(1e-18);

    const alternating = new Float64Array(n);
    for (let i = 0; i < n; i++) alternating[i] = i % 2 === 0 ? 0.5 : -0.5;
    plan.power(alternating, power);
    expect(power[n / 2]).toBeCloseTo((0.5 * n) ** 2, 6);
    for (let k = 0; k < n / 2; k++) expect(power[k]).toBeLessThan(1e-18);
  });

  it('puts an on-bin cosine at exactly N/2 * A on its bin and a sine at -i N/2 * A', () => {
    const n = 2048;
    const plan = RealFftPlan.forSize(n);
    const re = new Float64Array(plan.binCount);
    const im = new Float64Array(plan.binCount);
    plan.forward(sinusoid(n, 100, 0.8, Math.PI / 2), re, im); // cosine
    expect(re[100]).toBeCloseTo((0.8 * n) / 2, 9);
    expect(im[100]).toBeCloseTo(0, 9);
    plan.forward(sinusoid(n, 100, 0.8), re, im); // sine
    expect(re[100]).toBeCloseTo(0, 9);
    expect(im[100]).toBeCloseTo((-0.8 * n) / 2, 9);
  });

  it('lands a pure tone on the right bin at 48 kHz (bins every 23.4375 Hz)', () => {
    const n = 2048;
    const sampleRate = 48000;
    const plan = RealFftPlan.forSize(n);
    const power = new Float64Array(plan.binCount);
    const window = hannWindow(n).values;
    // On-bin tones, then the prototype tones (off-bin: the nearest bin must win).
    const cases: [number, number][] = [
      [23.4375 * 1, 1],
      [23.4375 * 278, 278],
      [23.4375 * 1000, 1000],
      [6517, Math.round((6517 * n) / sampleRate)],
      [5397, Math.round((5397 * n) / sampleRate)],
      [4542, Math.round((4542 * n) / sampleRate)],
      [17594, Math.round((17594 * n) / sampleRate)],
    ];
    for (const [hz, bin] of cases) {
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * hz * i) / sampleRate + 0.3);
      plan.power(x, power, window);
      expect(argMax(power)).toBe(bin);
    }
  });

  it('applies the window during packing exactly like pre-multiplying', () => {
    const n = 512;
    const x = randomVector(n, 99);
    const window = hannWindow(n).values;
    const premultiplied = x.map((value, i) => value * window[i]!);
    const plan = RealFftPlan.forSize(n);
    const a = new Float64Array(plan.binCount);
    const b = new Float64Array(plan.binCount);
    plan.power(x, a, window);
    plan.power(premultiplied, b);
    for (let k = 0; k < plan.binCount; k++) expect(a[k]).toBeCloseTo(b[k]!, 12);
  });

  it('gives identical results for Float32Array and Float64Array input holding the same values', () => {
    const n = 1024;
    const x32 = Float32Array.from(randomVector(n, 5));
    const x64 = Float64Array.from(x32);
    const plan = RealFftPlan.forSize(n);
    const a = new Float64Array(plan.binCount);
    const b = new Float64Array(plan.binCount);
    plan.power(x32, a);
    plan.power(x64, b);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('caches plans and rejects bad sizes and buffer lengths', () => {
    expect(RealFftPlan.forSize(2048)).toBe(RealFftPlan.forSize(2048));
    for (const bad of [1, 0, 6, 1000]) expect(() => RealFftPlan.forSize(bad)).toThrow(RangeError);
    const plan = RealFftPlan.forSize(16);
    expect(() => {
      plan.power(new Float64Array(8), new Float64Array(9));
    }).toThrow(RangeError);
    expect(() => {
      plan.power(new Float64Array(16), new Float64Array(16));
    }).toThrow(RangeError);
    expect(() => {
      plan.power(new Float64Array(16), new Float64Array(9), new Float64Array(8));
    }).toThrow(RangeError);
  });
});

describe('FFT micro-benchmark', () => {
  it('runs a 2048-point real FFT well under 1 ms', () => {
    const n = 2048;
    const plan = RealFftPlan.forSize(n);
    const input = Float32Array.from(randomVector(n, 2048));
    const window = hannWindow(n).values;
    const re = new Float64Array(plan.binCount);
    const im = new Float64Array(plan.binCount);
    const power = new Float64Array(plan.binCount);

    for (let i = 0; i < 500; i++) plan.forward(input, re, im); // warm up the JIT
    const iterations = 4000;
    let start = performance.now();
    for (let i = 0; i < iterations; i++) plan.forward(input, re, im);
    const forwardUs = ((performance.now() - start) * 1000) / iterations;

    for (let i = 0; i < 500; i++) plan.power(input, power, window);
    start = performance.now();
    for (let i = 0; i < iterations; i++) plan.power(input, power, window);
    const powerUs = ((performance.now() - start) * 1000) / iterations;

    console.log(
      `[bench] 2048-point real FFT: ${forwardUs.toFixed(1)} us/transform; ` +
        `Hann-windowed power spectrum: ${powerUs.toFixed(1)} us/frame`,
    );
    // Generous bound so slow CI machines never flake; the real figure is tens of microseconds.
    expect(forwardUs).toBeLessThan(1000);
    expect(powerUs).toBeLessThan(1000);
  });
});
