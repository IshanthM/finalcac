/** Onset → analysis → verdict, for one event or a whole recording. Pure; used by the engine, the analyzer CLI and tests. */
import { OnsetDetector, type Onset, type OnsetOptions } from './onset.ts';
import { analyzeEvent, type AnalysisOptions, type EventAnalysis } from './eventAnalysis.ts';
import { judgeEvent, type Verdict } from './detector.ts';
import type { TagProfile } from './profile.ts';
import { PARAMS } from './params.ts';

export interface Evaluation {
  onset: Onset;
  analysis: EventAnalysis;
  verdict: Verdict;
}

export interface EvaluateOptions extends AnalysisOptions {
  skipTolerance?: boolean;
  /** Audio kept before the onset when cutting the segment (ms). */
  preMs?: number;
}

/** Cut [onset − preMs, onset + analyzeAfterMs] out of `x`, analyse it and judge it. Null if too close to the end. */
export function evaluateOnset(
  x: Float32Array,
  sampleRate: number,
  onset: Onset,
  profile: TagProfile | null,
  opts: EvaluateOptions = {},
): Evaluation | null {
  const pre = Math.round(((opts.preMs ?? 300) * sampleRate) / 1000);
  const post = Math.round((PARAMS.analyzeAfterMs * sampleRate) / 1000);
  const start = Math.max(0, onset.frameStart - pre);
  const end = onset.frameStart + post;
  if (end > x.length) return null;
  const analysis = analyzeEvent(x.subarray(start, end), sampleRate, onset.frameStart - start, opts);
  return { onset, analysis, verdict: judgeEvent(analysis, profile, { skipTolerance: opts.skipTolerance }) };
}

/** Run the whole chain over a recording and return one evaluation per onset. */
export function scanSignal(
  x: Float32Array,
  sampleRate: number,
  profile: TagProfile | null,
  opts: EvaluateOptions & { onset?: OnsetOptions } = {},
): Evaluation[] {
  const det = new OnsetDetector(sampleRate, opts.onset);
  const onsets: Onset[] = [];
  for (let i = 0; i < x.length; i += 128) onsets.push(...det.process(x.subarray(i, i + 128)));
  const out: Evaluation[] = [];
  for (const o of onsets) {
    const e = evaluateOnset(x, sampleRate, o, profile, opts);
    if (e) out.push(e);
  }
  return out;
}
