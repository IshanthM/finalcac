import { describe, expect, it } from 'vitest';
import { OnsetDetector } from '../src/dsp/onset.ts';
import { analyzeEvent } from '../src/dsp/eventAnalysis.ts';
import { gaussianNoise, ringSignal } from './helpers/synth.ts';

function runOnsets(x: Float32Array, sr: number) {
  const d = new OnsetDetector(sr);
  const found = [];
  for (let i = 0; i < x.length; i += 128) found.push(...d.process(x.subarray(i, i + 128)));
  return found;
}

describe('OnsetDetector', () => {
  it('fires once, near the ring start, for a click + ring in noise', () => {
    const { x, onset, sampleRate } = ringSignal({ clickAmp: 0.3, clickMs: 1 });
    const found = runOnsets(x, sampleRate);
    expect(found).toHaveLength(1);
    expect(found[0]!.frameEnd).toBeGreaterThanOrEqual(onset);
    expect(found[0]!.frameEnd - onset).toBeLessThan(0.01 * sampleRate);
  });

  it('stays silent on stationary noise', () => {
    expect(runOnsets(gaussianNoise(48000 * 3, 0.005, 3), 48000)).toHaveLength(0);
  });

  it('adapts its floor: a louder steady noise level starts silent, then a ring fires', () => {
    const { x, sampleRate } = ringSignal({ noiseRms: 0.02, amp: 0.5, seconds: 2, onsetMs: 1500 });
    expect(runOnsets(x, sampleRate)).toHaveLength(1);
  });

  it('works at 44.1 kHz', () => {
    const { x, sampleRate } = ringSignal({ sampleRate: 44100, clickAmp: 0.3, clickMs: 1 });
    expect(runOnsets(x, sampleRate)).toHaveLength(1);
  });

  it('does not double-fire on a ring tail inside the refractory period', () => {
    const a = ringSignal({ onsetMs: 500, tauMs: 30, seconds: 2, seed: 4 });
    expect(runOnsets(a.x, a.sampleRate)).toHaveLength(1);
  });
});

describe('analyzeEvent', () => {
  it('measures frequency, tau, ring length and click on synthetic data', () => {
    const { x, onset, sampleRate } = ringSignal({ freqHz: 13287, tauMs: 8, amp: 0.05, clickAmp: 0.3, clickMs: 2, noiseRms: 0.0005 });
    const a = analyzeEvent(x, sampleRate, onset - 200);
    expect(Math.abs(a.onsetIndex - onset)).toBeLessThan(0.002 * sampleRate);
    expect(Math.abs(a.peak!.freqHz - 13287) / 13287).toBeLessThan(0.002);
    expect(a.snrDb).toBeGreaterThan(20);
    expect(Math.abs(a.tauMs - 8) / 8).toBeLessThan(0.25);
    expect(a.ringMs).toBeGreaterThan(25);
    expect(a.decayR2).toBeGreaterThan(0.9);
    expect(a.clickMs).toBeGreaterThan(0.5);
    expect(a.clickMs).toBeLessThan(8);
  });

  it('reports no click when there is none', () => {
    const { x, onset, sampleRate } = ringSignal({ freqHz: 13300, tauMs: 6, noiseRms: 0.0005 });
    expect(analyzeEvent(x, sampleRate, onset - 200).clickMs).toBeLessThan(6) // resolution is about one 2.7 ms frame;
  });
});
