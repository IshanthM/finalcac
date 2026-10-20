import { describe, expect, it } from 'vitest';
import { createGaussian, createRandom, whiteNoise } from '../src/dsp/random.ts';

describe('createRandom', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = createRandom(123);
    const b = createRandom(123);
    const c = createRandom(124);
    const seqA = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(seqA);
    expect(Array.from({ length: 5 }, c)).not.toEqual(seqA);
  });

  it('matches the canonical Mulberry32 implementation', () => {
    // The widely copied reference version (bryc/code, "mulberry32"), kept verbatim in spirit.
    function reference(seed: number): () => number {
      let a = seed;
      return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    for (const seed of [0, 1, 42, 0xdeadbeef]) {
      const ours = createRandom(seed);
      const theirs = reference(seed);
      for (let i = 0; i < 1000; i++) expect(ours()).toBe(theirs());
    }
    expect(Math.round(createRandom(1)() * 4294967296)).toBe(2693262067);
  });

  it('stays in [0, 1) with a uniform mean', () => {
    const random = createRandom(9);
    let sum = 0;
    for (let i = 0; i < 100_000; i++) {
      const value = random();
      expect(value >= 0 && value < 1).toBe(true);
      sum += value;
    }
    expect(sum / 100_000).toBeCloseTo(0.5, 2);
  });
});

describe('createGaussian and whiteNoise', () => {
  it('gives zero mean and unit variance', () => {
    const gaussian = createGaussian(createRandom(77));
    const n = 200_000;
    let sum = 0;
    let sumSquares = 0;
    for (let i = 0; i < n; i++) {
      const value = gaussian();
      sum += value;
      sumSquares += value * value;
    }
    const mean = sum / n;
    expect(Math.abs(mean)).toBeLessThan(0.01);
    expect(Math.abs(sumSquares / n - mean * mean - 1)).toBeLessThan(0.02);
  });

  it('makes reproducible white noise at the requested RMS', () => {
    const noise = whiteNoise(48000, 0.01, 5);
    expect(Array.from(whiteNoise(48000, 0.01, 5))).toEqual(Array.from(noise));
    let sumSquares = 0;
    for (const value of noise) sumSquares += value * value;
    const rms = Math.sqrt(sumSquares / noise.length);
    expect(20 * Math.log10(rms)).toBeCloseTo(-40, 1);
  });
});
