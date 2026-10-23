/**
 * Measuring the detector on real recordings.
 *
 * A "capture" is one WAV recorded with the Debug recorder. Its filename says what was recorded, so the analysis can
 * tell a hit from a false alarm without a separate label file:
 *
 *     strike_quiet_d50_n10_20261023-181234.wav
 *     ^label ^room ^distance ^expected count ^timestamp
 *
 * For a "strike" file the expected count is how many times the tag was struck. For anything else (room noise, keys,
 * claps, music) the expected count is 0, so every ring the detector reports there is a false alarm.
 *
 * Everything here is pure (no files, no DOM) so it can be tested. tools/analyze-folder.ts does the file reading.
 */
import type { GateName } from './detector.ts';
import { scanSignal } from './pipeline.ts';
import type { TagProfile } from './profile.ts';

export const CAPTURE_LABELS = ['strike', 'noise', 'keys', 'clap', 'music', 'other'] as const;
export type CaptureLabel = (typeof CAPTURE_LABELS)[number];

export interface CaptureMeta {
  label: CaptureLabel;
  /** 'quiet' | 'noisy' (free text without underscores is accepted). */
  room: string;
  /** e.g. 'd10', 'd50', 'd100' (centimetres) or 'dna'. */
  distance: string;
  /** How many tag strikes the person made in this capture (0 for non-strike labels). */
  expected: number;
}

const safe = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** `strike_quiet_d50_n10_20261023-181234.wav` from the form fields. */
export function captureFilename(meta: CaptureMeta, stamp: string): string {
  const n = meta.label === 'strike' ? Math.max(0, Math.round(meta.expected)) : 0;
  return `${meta.label}_${safe(meta.room) || 'room'}_${safe(meta.distance) || 'dna'}_n${n}_${stamp}.wav`;
}

/** Reads the fields back out of a filename. Returns null if the name does not follow the pattern. */
export function parseCaptureName(name: string): CaptureMeta | null {
  const base = name.replace(/^.*[\\/]/, '').replace(/\.wav$/i, '');
  const m = /^([a-z]+)_([a-z0-9]+)_(d[a-z0-9]+)_n(\d+)(?:_.*)?$/i.exec(base);
  if (!m) return null;
  const label = m[1]!.toLowerCase();
  if (!(CAPTURE_LABELS as readonly string[]).includes(label)) return null;
  return { label: label as CaptureLabel, room: m[2]!.toLowerCase(), distance: m[3]!.toLowerCase(), expected: Number(m[4]) };
}

export interface EventRow {
  /** Seconds from the start of the file to the onset. */
  atS: number;
  /** Peak frequency of the ring candidate, if one was found. */
  peakHz: number | null;
  /** Approximate level of the ring in dBFS (the estimated sinusoid amplitude; underestimates a fast decay). */
  levelDbfs: number | null;
  snrDb: number;
  guardDb: number | null;
  accepted: boolean;
  failed: GateName[];
}

export interface FileEval {
  events: EventRow[];
  /** Typical background level of the file in dBFS (median of 100 ms RMS windows). */
  backgroundDbfs: number;
  durationS: number;
}

/** Median of 100 ms RMS windows, in dBFS: what "quiet" means in this recording. */
export function backgroundLevelDbfs(x: Float32Array, sampleRate: number): number {
  const win = Math.max(1, Math.round(sampleRate * 0.1));
  const levels: number[] = [];
  for (let s = 0; s + win <= x.length; s += win) {
    let sum = 0;
    for (let i = 0; i < win; i++) sum += x[s + i]! * x[s + i]!;
    levels.push(10 * Math.log10(sum / win + 1e-20));
  }
  if (levels.length === 0) return -120;
  levels.sort((a, b) => a - b);
  return levels[Math.floor(levels.length / 2)]!;
}

/**
 * Run the detector over one recording.
 * With `profile = null` the frequency check is skipped, which is how a store would calibrate: we look at what the
 * tag does before we tell the detector what to expect.
 */
export function evaluateFile(x: Float32Array, sampleRate: number, profile: TagProfile | null): FileEval {
  const evals = scanSignal(x, sampleRate, profile, { skipTolerance: profile === null });
  const events: EventRow[] = evals.map((e) => ({
    atS: e.onset.frameStart / sampleRate,
    peakHz: e.analysis.peak?.freqHz ?? null,
    levelDbfs: e.analysis.peak ? 20 * Math.log10(Math.max(e.analysis.peak.amplitude, 1e-9)) : null,
    snrDb: e.analysis.snrDb,
    guardDb: e.analysis.peak?.guardMarginDb ?? null,
    accepted: e.verdict.accepted,
    failed: e.verdict.failed,
  }));
  return { events, backgroundDbfs: backgroundLevelDbfs(x, sampleRate), durationS: x.length / sampleRate };
}

const median = (v: number[]): number => {
  const a = [...v].sort((p, q) => p - q);
  const m = Math.floor(a.length / 2);
  return a.length === 0 ? NaN : a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
};

/**
 * Learn the tag profile from the rings found in the strike files (first pass, no frequency check).
 * Method: take the median frequency, drop rings more than 5% away (a stray accepted noise, not the tag), then
 * recompute. `spreadFrac` is the largest deviation of the kept rings, the same definition calibration uses.
 */
export function learnProfile(strikeEvents: EventRow[], sampleRate: number): TagProfile | null {
  const freqs = strikeEvents.filter((e) => e.accepted && e.peakHz !== null).map((e) => e.peakHz!);
  if (freqs.length < 3) return null;
  const first = median(freqs);
  const kept = freqs.filter((f) => Math.abs(f - first) / first <= 0.05);
  if (kept.length < 3) return null;
  const med = median(kept);
  const spread = Math.max(...kept.map((f) => Math.abs(f - med) / med));
  return { freqHz: med, spreadFrac: spread, decayMs: 0, sampleRate, calibratedAt: new Date().toISOString(), rings: kept.slice(0, 20) };
}

export interface FileResult { name: string; meta: CaptureMeta; eval: FileEval }

export interface Summary {
  strike: {
    files: number; expected: number; found: number; missed: number; extra: number;
    byCondition: Record<string, { expected: number; found: number }>;
    medianHz: number; spreadFrac: number; medianSnrDb: number; minSnrDb: number; medianLevelDbfs: number;
    /** Why events that did not count as rings failed (an event can fail several gates). */
    gateFailures: Record<GateName, number>;
    eventsNotAccepted: number;
  };
  negatives: Record<string, { files: number; seconds: number; falseAlarms: number }>;
  falseAlarms: number;
  negativeSeconds: number;
}

export function summarize(results: FileResult[]): Summary {
  const gateFailures: Record<GateName, number> = { snr: 0, guard: 0, decay: 0, tolerance: 0 };
  const byCondition: Summary['strike']['byCondition'] = {};
  const negatives: Summary['negatives'] = {};
  let files = 0, expected = 0, found = 0, extra = 0, notAccepted = 0, falseAlarms = 0, negSeconds = 0;
  const hz: number[] = [], snr: number[] = [], level: number[] = [];

  for (const r of results) {
    const accepted = r.eval.events.filter((e) => e.accepted);
    if (r.meta.label === 'strike') {
      files++;
      expected += r.meta.expected;
      const f = Math.min(accepted.length, r.meta.expected);
      found += f;
      extra += Math.max(0, accepted.length - r.meta.expected);
      const key = `${r.meta.room}/${r.meta.distance}`;
      const c = (byCondition[key] ??= { expected: 0, found: 0 });
      c.expected += r.meta.expected;
      c.found += f;
      for (const e of accepted) {
        if (e.peakHz !== null) hz.push(e.peakHz);
        snr.push(e.snrDb);
        if (e.levelDbfs !== null) level.push(e.levelDbfs);
      }
      for (const e of r.eval.events) if (!e.accepted) { notAccepted++; for (const g of e.failed) gateFailures[g]++; }
    } else {
      const n = (negatives[r.meta.label] ??= { files: 0, seconds: 0, falseAlarms: 0 });
      n.files++;
      n.seconds += r.eval.durationS;
      n.falseAlarms += accepted.length;
      falseAlarms += accepted.length;
      negSeconds += r.eval.durationS;
    }
  }
  const mHz = median(hz);
  return {
    strike: {
      files, expected, found, missed: expected - found, extra, byCondition,
      medianHz: mHz, spreadFrac: hz.length ? Math.max(...hz.map((f) => Math.abs(f - mHz) / mHz)) : NaN,
      medianSnrDb: median(snr), minSnrDb: snr.length ? Math.min(...snr) : NaN, medianLevelDbfs: median(level),
      gateFailures, eventsNotAccepted: notAccepted,
    },
    negatives, falseAlarms: falseAlarms + extra, negativeSeconds: negSeconds,
  };
}

/**
 * Plain statements of what the numbers say. Deliberately no marketing: it reports counts, and says "not clearly
 * visible" when the measured SNR or hit rate is below what the detector needs.
 */
export function verdict(s: Summary, snrGateDb: number): string[] {
  const out: string[] = [];
  const st = s.strike;
  if (st.expected === 0) return ['No strike recordings found: nothing to measure yet.'];
  out.push(`Strikes found: ${st.found} of ${st.expected} (${((st.found / st.expected) * 100).toFixed(0)}%) across ${st.files} recording(s).`);
  if (Number.isFinite(st.medianHz)) out.push(`Ring frequency: median ${st.medianHz.toFixed(0)} Hz, largest deviation ${(st.spreadFrac * 100).toFixed(2)}%.`);
  if (Number.isFinite(st.medianSnrDb)) {
    // Only rings the detector found have an SNR, so this number leaves out the strikes it missed and flatters the result.
    out.push(`Ring SNR over the background, found rings only: median ${st.medianSnrDb.toFixed(1)} dB (lowest ${st.minSnrDb.toFixed(1)} dB; the detector needs ${snrGateDb} dB).`);
  }
  // Judge each room/distance on its own: pooling a quiet room with a loud one hides where it stops working.
  const seen: string[] = [];
  const unseen: string[] = [];
  for (const [k, c] of Object.entries(st.byCondition)) (c.expected > 0 && c.found / c.expected >= 0.7 ? seen : unseen).push(`${k} (${c.found}/${c.expected})`);
  if (seen.length) out.push(`Ring found in at least 70% of strikes: ${seen.join(', ')}.`);
  if (unseen.length) out.push(`Ring NOT reliably found (under 70%): ${unseen.join(', ')}.`);
  if (!seen.length) out.push('The ring is NOT clearly visible in any recorded condition. Re-plan before tuning anything.');
  out.push(`False alarms: ${s.falseAlarms} in ${s.negativeSeconds.toFixed(0)} s of non-tag recordings plus ${st.extra} extra ring(s) inside strike recordings.`);
  return out;
}
