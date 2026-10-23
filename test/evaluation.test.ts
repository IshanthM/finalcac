import { describe, expect, it } from 'vitest';
import {
  backgroundLevelDbfs, captureFilename, evaluateFile, learnProfile, parseCaptureName, summarize, verdict,
  type FileResult,
} from '../src/dsp/evaluation.ts';
import { addClick, addTone, gaussianNoise, noiseRmsForSnr } from './helpers/synth.ts';

const SR = 48000;
const F0 = 13300;

/** Noise with `n` tag rings (each preceded by a click), 1.2 s apart. */
function strikes(n: number, snrDb = 30, seed = 5): Float32Array {
  const x = gaussianNoise(Math.round((n * 1.2 + 0.6) * SR), noiseRmsForSnr(0.1, F0, snrDb), seed);
  for (let i = 0; i < n; i++) {
    const t = 600 + i * 1200;
    addClick(x, SR, t, 0.25, 1.5, seed + i + 1);
    addTone(x, SR, t + 1, F0, 0.1, 8);
  }
  return x;
}

describe('capture file names', () => {
  it('round-trips through captureFilename and parseCaptureName', () => {
    const name = captureFilename({ label: 'strike', room: 'Quiet', distance: 'd50', expected: 10 }, '20261023-181234');
    expect(name).toBe('strike_quiet_d50_n10_20261023-181234.wav');
    expect(parseCaptureName(name)).toEqual({ label: 'strike', room: 'quiet', distance: 'd50', expected: 10 });
  });
  it('forces the expected count to 0 for anything that is not a strike', () => {
    const name = captureFilename({ label: 'keys', room: 'quiet', distance: 'dna', expected: 7 }, 'x');
    expect(parseCaptureName(name)?.expected).toBe(0);
  });
  it('strips unsafe characters so the name cannot break the pattern', () => {
    const name = captureFilename({ label: 'clap', room: 'my room_1', distance: 'd 1/0', expected: 0 }, 's');
    expect(parseCaptureName(name)).not.toBeNull();
  });
  it('returns null for names that do not follow the pattern or use an unknown label', () => {
    expect(parseCaptureName('rec10s-2026-10-23.wav')).toBeNull();
    expect(parseCaptureName('guitar_quiet_d50_n0_x.wav')).toBeNull();
  });
  it('accepts a folder path in front of the name', () => {
    expect(parseCaptureName('/tmp/rec/noise_noisy_dna_n0_a.wav')?.label).toBe('noise');
  });
});

describe('evaluateFile', () => {
  it('finds each strike and reports its frequency', () => {
    const r = evaluateFile(strikes(3), SR, null);
    const hits = r.events.filter((e) => e.accepted);
    expect(hits).toHaveLength(3);
    for (const h of hits) expect(Math.abs(h.peakHz! - F0) / F0).toBeLessThan(0.003);
  });
  it('reports nothing for plain noise', () => {
    const r = evaluateFile(gaussianNoise(SR * 2, 0.01, 9), SR, null);
    expect(r.events.filter((e) => e.accepted)).toHaveLength(0);
  });
  it('measures the background level of the file', () => {
    // RMS 0.01 is -40 dBFS.
    expect(backgroundLevelDbfs(gaussianNoise(SR * 2, 0.01, 3), SR)).toBeCloseTo(-40, 0);
  });
});

describe('learnProfile', () => {
  it('learns the frequency from accepted rings', () => {
    const r = evaluateFile(strikes(5), SR, null);
    const p = learnProfile(r.events, SR)!;
    expect(Math.abs(p.freqHz - F0) / F0).toBeLessThan(0.003);
    expect(p.spreadFrac).toBeLessThan(0.005);
  });
  it('refuses to learn from fewer than 3 rings', () => {
    expect(learnProfile(evaluateFile(strikes(2), SR, null).events, SR)).toBeNull();
  });
  it('ignores a stray accepted event far from the others', () => {
    const base = evaluateFile(strikes(5), SR, null).events;
    const stray = { ...base[0]!, peakHz: 9500 };
    const p = learnProfile([...base, stray], SR)!;
    expect(Math.abs(p.freqHz - F0) / F0).toBeLessThan(0.003);
  });
});

describe('summarize and verdict', () => {
  const result = (name: string, x: Float32Array): FileResult => ({
    name, meta: parseCaptureName(name)!, eval: evaluateFile(x, SR, null),
  });

  it('counts hits, misses and false alarms with the right denominators', () => {
    // 5 strikes recorded, but we say the person struck 6 times: one miss. Noise file: no false alarms.
    const s = summarize([
      result('strike_quiet_d50_n6_a.wav', strikes(5)),
      result('noise_quiet_dna_n0_b.wav', gaussianNoise(SR * 3, 0.01, 4)),
    ]);
    expect(s.strike.expected).toBe(6);
    expect(s.strike.found).toBe(5);
    expect(s.strike.missed).toBe(1);
    expect(s.falseAlarms).toBe(0);
    expect(s.negativeSeconds).toBeCloseTo(3, 5);
    expect(s.strike.byCondition['quiet/d50']).toEqual({ expected: 6, found: 5 });
  });
  it('counts rings in a non-strike file as false alarms', () => {
    // A "clap" recording that really contains tag rings: every ring is a false alarm by definition.
    const s = summarize([result('clap_quiet_dna_n0_a.wav', strikes(2))]);
    expect(s.falseAlarms).toBe(2);
    expect(s.negatives.clap).toMatchObject({ files: 1, falseAlarms: 2 });
  });
  it('counts extra rings inside a strike file as false alarms, not as extra hits', () => {
    const s = summarize([result('strike_quiet_d10_n2_a.wav', strikes(4))]);
    expect(s.strike.found).toBe(2);
    expect(s.strike.extra).toBe(2);
    expect(s.falseAlarms).toBe(2);
  });
  it('judges each room and distance on its own', () => {
    const good = summarize([result('strike_quiet_d50_n5_a.wav', strikes(5))]);
    expect(verdict(good, 12).join(' ')).toContain('at least 70% of strikes: quiet/d50 (5/5)');
    const none = summarize([result('strike_quiet_d50_n5_a.wav', gaussianNoise(SR * 4, 0.01, 2))]);
    expect(verdict(none, 12).join(' ')).toContain('NOT clearly visible in any recorded condition');
  });
  it('does not let a good quiet room hide a bad noisy one', () => {
    const s = summarize([
      result('strike_quiet_d50_n5_a.wav', strikes(5)),
      result('strike_noisy_d50_n5_b.wav', gaussianNoise(SR * 4, 0.05, 2)),
    ]);
    const text = verdict(s, 12).join(' ');
    expect(text).toContain('quiet/d50 (5/5)');
    expect(text).toContain('under 70%): noisy/d50 (0/5)');
  });
  it('does not invent numbers when there are no strike recordings', () => {
    expect(verdict(summarize([]), 12)).toEqual(['No strike recordings found: nothing to measure yet.']);
  });
});
