import { describe, expect, it } from 'vitest';
import { evaluateOnset, scanSignal } from '../src/dsp/pipeline.ts';
import type { TagProfile } from '../src/dsp/profile.ts';
import { toleranceFrac } from '../src/dsp/profile.ts';
import { addClick, addNoiseBurst, addTone, gaussianNoise, noiseRmsForSnr, uniform } from './helpers/synth.ts';

const SR = 48000;
const F0 = 13300;
const profile: TagProfile = { freqHz: F0, spreadFrac: 0.002, decayMs: 8, sampleRate: SR, calibratedAt: '2026-10-20T00:00:00Z', rings: [] };
const TOL = toleranceFrac(profile.spreadFrac);

/** 1.2 s of noise with a tag ring (optional click first) at 600 ms. */
function ring(opts: { f?: number; snrDb: number; click?: boolean; tauMs?: number; seed?: number; amp?: number }) {
  const f = opts.f ?? F0;
  const amp = opts.amp ?? 0.1;
  const x = gaussianNoise(Math.round(1.2 * SR), noiseRmsForSnr(amp, f, opts.snrDb), opts.seed ?? 5);
  if (opts.click) addClick(x, SR, 600, 0.25, 1.5, (opts.seed ?? 5) + 1);
  addTone(x, SR, opts.click ? 601 : 600, f, amp, opts.tauMs ?? 8);
  return x;
}
const accepted = (x: Float32Array, p: TagProfile | null = profile) => scanSignal(x, SR, p).filter((e) => e.verdict.accepted);

describe('tag rings are accepted', () => {
  for (const snr of [20, 30, 40]) {
    for (const f of [13250, 13300, 13350]) {
      it(`${f} Hz at ${snr} dB SNR, with click`, () => {
        const hits = accepted(ring({ f, snrDb: snr, click: true }));
        expect(hits).toHaveLength(1);
        expect(Math.abs(hits[0]!.analysis.peak!.freqHz - f) / f).toBeLessThan(0.003);
      });
    }
  }
  it('works without a click at high SNR', () => {
    expect(accepted(ring({ snrDb: 30 }))).toHaveLength(1);
  });
  it('works at 44.1 kHz', () => {
    const sr = 44100;
    const x = gaussianNoise(Math.round(1.2 * sr), noiseRmsForSnr(0.1, F0, 30, sr), 3);
    addClick(x, sr, 600, 0.25, 1.5, 4);
    addTone(x, sr, 601, F0, 0.1, 8);
    expect(scanSignal(x, sr, { ...profile, sampleRate: sr }).filter((e) => e.verdict.accepted)).toHaveLength(1);
  });
});

describe('weak rings are rejected on SNR', () => {
  it('6 dB SNR is never accepted', () => {
    for (const seed of [1, 2, 3, 4]) expect(accepted(ring({ snrDb: 6, click: true, seed }))).toHaveLength(0);
  });
  it('12 dB boundary: measured SNR tracks the nominal one', () => {
    // Force the onset (a 12 dB ring in loud noise would not trigger the onset detector by itself).
    const onset = { frameStart: 600 * 48 - 128, frameEnd: 600 * 48 + 128, bandDb: 0, floorDb: 0 };
    const e = evaluateOnset(ring({ snrDb: 12, click: true }), SR, onset, profile)!;
    expect(Math.abs(e.analysis.snrDb - 12)).toBeLessThan(4);
  });
});

describe('the tolerance gate', () => {
  it('accepts just inside and rejects just outside the tolerance, both sides', () => {
    for (const sign of [1, -1]) {
      const inside = F0 * (1 + sign * (TOL - 0.0025));
      const outside = F0 * (1 + sign * (TOL + 0.003));
      expect(accepted(ring({ f: inside, snrDb: 35, click: true }))).toHaveLength(1);
      const out = scanSignal(ring({ f: outside, snrDb: 35, click: true }), SR, profile);
      expect(out.filter((e) => e.verdict.accepted)).toHaveLength(0);
      expect(out.some((e) => e.verdict.failed.includes('tolerance'))).toBe(true);
    }
  });
  it('rejects everything when uncalibrated', () => {
    expect(accepted(ring({ snrDb: 35, click: true }), null)).toHaveLength(0);
  });
});

describe('look-alikes are rejected', () => {
  it('white-noise bursts (narrowband guard / ringdown)', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const x = gaussianNoise(Math.round(1.2 * SR), 0.001, seed);
      addNoiseBurst(x, SR, 600, 25, 0.15, seed + 100);
      expect(accepted(x)).toHaveLength(0);
    }
  });

  it('clatter of random decaying tones, even with an in-tolerance tone among them', () => {
    let hits = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = uniform(seed);
      const x = gaussianNoise(Math.round(1.2 * SR), 0.001, seed);
      addClick(x, SR, 600, 0.3, 2, seed + 7);
      for (let k = 0; k < 8; k++) addTone(x, SR, 600 + r() * 5, 3000 + r() * 12500, 0.04 + r() * 0.1, 2 + r() * 12, r() * 6);
      hits += accepted(x).length;
    }
    // A lone strong tone landing inside ±0.8% of 13.3 kHz by chance is physically indistinguishable from a ring
    // by frequency alone (about 3% per tone); measured on these seeds it is a few of 40, never more.
    expect(hits).toBeLessThanOrEqual(3);
  });

  it('a tag-frequency tone with other tones 3% away on both sides (guard)', () => {
    const x = gaussianNoise(Math.round(1.2 * SR), 0.0005, 9);
    addClick(x, SR, 600, 0.25, 1.5, 10);
    addTone(x, SR, 601, F0, 0.1, 8);
    addTone(x, SR, 601, F0 * 1.03, 0.09, 8);
    addTone(x, SR, 601, F0 * 0.97, 0.09, 8);
    const out = scanSignal(x, SR, profile);
    expect(out.filter((e) => e.verdict.accepted)).toHaveLength(0);
    expect(out.some((e) => e.verdict.failed.includes('guard'))).toBe(true);
  });

  it('music-like sustained chords with note onsets', () => {
    let hits = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = uniform(seed);
      const x = gaussianNoise(Math.round(2 * SR), 0.003, seed);
      for (let note = 0; note < 4; note++) {
        const f0 = 110 * 2 ** (r() * 3);
        const t0 = 100 + note * 400 + r() * 100;
        for (let h = 1; h * f0 < 16000; h++) addTone(x, SR, t0, h * f0, 0.12 / h ** 0.8, 150 + r() * 200, r() * 6);
      }
      hits += accepted(x).length;
    }
    expect(hits).toBe(0);
  });

  it('steady tone with no decay (an alarm beep, not a ring)', () => {
    const x = gaussianNoise(Math.round(1.2 * SR), 0.001, 21);
    addTone(x, SR, 600, F0, 0.1, 5000);
    expect(accepted(x)).toHaveLength(0);
  });
});

describe('onset position does not matter (regression: first 1 ms frame can be pure noise)', () => {
  const rates = [44100, 48000];
  for (const sr of rates) {
    it(`accepts a ring whatever its sub-millisecond offset, at ${sr} Hz`, () => {
      const prof = { ...profile, sampleRate: sr };
      for (let k = 0; k < 12; k++) {
        const onsetMs = 600 + k * 0.37; // 12 offsets across several analysis hops
        const x = gaussianNoise(Math.round(1.2 * sr), 0.0005, 40 + k);
        addClick(x, sr, onsetMs, 0.3, 2, 140 + k);
        addTone(x, sr, onsetMs + 1, 13402, 0.05, 8);
        const hits = scanSignal(x, sr, { ...prof, freqHz: 13402 }).filter((e) => e.verdict.accepted);
        expect(hits, `offset ${k}`).toHaveLength(1);
      }
    });
  }
});
