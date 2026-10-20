import { describe, expect, it } from 'vitest';
import {
  HANN_COHERENT_GAIN,
  HANN_ENBW_BINS,
  describeWindow,
  hannPeriodicValues,
  hannWindow,
} from '../src/dsp/window.ts';
import { naiveDft, powersOfTwo } from './helpers/signals.ts';

describe('periodic Hann window', () => {
  it('has the textbook values for N = 8', () => {
    const w = hannPeriodicValues(8);
    const c = Math.SQRT1_2;
    const expected = [0, 0.5 - 0.5 * c, 0.5, 0.5 + 0.5 * c, 1, 0.5 + 0.5 * c, 0.5, 0.5 - 0.5 * c];
    expected.forEach((value, n) => {
      expect(w[n]).toBeCloseTo(value, 15);
    });
  });

  it('is DFT-even: w[0] = 0, w[N/2] = 1 and w[n] = w[N - n]', () => {
    for (const n of [16, 2048, 4096]) {
      const w = hannPeriodicValues(n);
      expect(w[0]).toBe(0);
      expect(w[n / 2]).toBeCloseTo(1, 15);
      for (let i = 1; i < n; i++) expect(Math.abs(w[i]! - w[n - i]!)).toBeLessThan(1e-15);
    }
  });

  it('meets the exact sums: sum w = N/2, sum w^2 = 3N/8', () => {
    const sizes = [...powersOfTwo(4, 65536), 3, 5, 100, 1000, 1023];
    for (const n of sizes) {
      const w = hannWindow(n);
      expect(w.length).toBe(n);
      expect(Math.abs(w.sum - n / 2) / (n / 2)).toBeLessThan(1e-12);
      expect(Math.abs(w.sumOfSquares - (3 * n) / 8) / ((3 * n) / 8)).toBeLessThan(1e-12);
      expect(w.coherentGain).toBeCloseTo(HANN_COHERENT_GAIN, 12);
      expect(w.enbwBins).toBeCloseTo(HANN_ENBW_BINS, 12);
    }
  });

  it('documents that N = 2 is degenerate for the sum-of-squares identity', () => {
    const w = hannWindow(2); // [0, 1]
    expect(w.sum).toBe(1);
    expect(w.sumOfSquares).toBe(1);
    expect(w.enbwBins).toBe(2);
  });

  it('has a DFT with exactly three non-zero bins: N/2 at 0 and -N/4 at +-1', () => {
    const n = 64;
    const values = hannPeriodicValues(n);
    const spectrum = naiveDft(values, new Float64Array(n));
    expect(spectrum.re[0]).toBeCloseTo(n / 2, 10);
    expect(spectrum.re[1]).toBeCloseTo(-n / 4, 10);
    expect(spectrum.re[n - 1]).toBeCloseTo(-n / 4, 10);
    for (let k = 2; k < n - 1; k++) {
      expect(Math.hypot(spectrum.re[k]!, spectrum.im[k]!)).toBeLessThan(1e-12);
    }
  });

  it('caches windows per length', () => {
    expect(hannWindow(2048)).toBe(hannWindow(2048));
    expect(hannWindow(2048)).not.toBe(hannWindow(4096));
  });

  it('rejects lengths below 2 and non-integers', () => {
    for (const bad of [0, 1, 2.5, -4, Number.NaN]) {
      expect(() => hannPeriodicValues(bad)).toThrow(RangeError);
    }
  });
});

describe('describeWindow', () => {
  it('gives a rectangular window unit coherent gain and 1-bin ENBW', () => {
    const w = describeWindow(new Float64Array(256).fill(1));
    expect(w.sum).toBe(256);
    expect(w.sumOfSquares).toBe(256);
    expect(w.coherentGain).toBe(1);
    expect(w.enbwBins).toBe(1);
  });

  it('rejects empty and zero-sum windows', () => {
    expect(() => describeWindow(new Float64Array(0))).toThrow(RangeError);
    expect(() => describeWindow(new Float64Array([1, -1]))).toThrow(RangeError);
  });
});
