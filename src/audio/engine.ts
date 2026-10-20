/** Microphone capture: getUserMedia (all processing off) → AudioWorklet → 2 s ring buffer → onset + analysis. */
import { RingBuffer } from '../dsp/ringBuffer.ts';
import { OnsetDetector, type Onset } from '../dsp/onset.ts';
import type { EventAnalysis } from '../dsp/eventAnalysis.ts';
import type { Verdict } from '../dsp/detector.ts';
import { evaluateOnset } from '../dsp/pipeline.ts';
import type { TagProfile } from '../dsp/profile.ts';
import { PARAMS } from '../dsp/params.ts';
import workletUrl from './capture-worklet.js?worker&url';

export type EngineState = 'idle' | 'starting' | 'running' | 'suspended' | 'error';

export interface CapturedEvent {
  id: number;
  /** Wall-clock time of detection. */
  at: number;
  onset: Onset;
  analysis: EventAnalysis;
  verdict: Verdict;
  /** True if this event was judged while calibrating (frequency match skipped). */
  calibrating: boolean;
}

export interface Snapshot {
  id: number;
  at: number;
  sampleRate: number;
  /** 0.5 s before to 1 s after the onset. */
  samples: Float32Array;
}

export interface EngineInfo {
  state: EngineState;
  contextState: string;
  sampleRate: number;
  baseLatencyMs: number;
  trackSettings: MediaTrackSettings | null;
  trackConstraints: MediaTrackConstraints | null;
  error?: string;
}

const PRE_S = 0.5;
const ANALYSE_AFTER_S = PARAMS.analyzeAfterMs / 1000;
const SNAPSHOT_AFTER_S = 1.0;

type Listener = () => void;
export type EngineMode = 'detect' | 'calibrate';
export type EventListener = (ev: CapturedEvent) => void;

export class CaptureEngine {
  ring: RingBuffer | null = null;
  detector: OnsetDetector | null = null;
  /** Number of onsets seen (increments immediately, before the 300 ms analysis). */
  onsetCount = 0;
  events: CapturedEvent[] = [];
  snapshots: Snapshot[] = [];
  /** Peak |x| and RMS of the latest block (0..1), for the level meter. */
  level = { peak: 0, rms: 0 };
  info: EngineInfo = {
    state: 'idle', contextState: 'closed', sampleRate: 0, baseLatencyMs: 0, trackSettings: null, trackConstraints: null,
  };

  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  /** Tag profile used by the tolerance gate; null = not calibrated (nothing is accepted in 'detect' mode). */
  profile: TagProfile | null = null;
  mode: EngineMode = 'detect';
  private listeners = new Set<Listener>();
  private eventListeners = new Set<EventListener>();
  private pending: { onset: Onset; at: number; analysed: boolean; saved: boolean }[] = [];
  private recording: { chunks: Float32Array[]; remaining: number; resolve: (s: Float32Array) => void } | null = null;
  private nextId = 1;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  /** Called once per evaluated event (accepted or not), after the gates ran. */
  onEvent(fn: EventListener): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }
  setProfile(p: TagProfile | null): void {
    this.profile = p;
    this.emit();
  }
  setMode(m: EngineMode): void {
    this.mode = m;
    this.emit();
  }
  private emit(): void {
    for (const fn of this.listeners) fn();
  }
  private setInfo(patch: Partial<EngineInfo>): void {
    this.info = { ...this.info, ...patch };
    this.emit();
  }

  /** Must be called from a user gesture (tap): creates + resumes the AudioContext, asks for the mic. */
  async start(): Promise<void> {
    if (this.info.state === 'running' || this.info.state === 'starting') return;
    this.setInfo({ state: 'starting', error: undefined });
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      // Resume inside the tap, before the first await that could lose the gesture.
      const resumed = this.ctx.resume();
      const constraints: MediaTrackConstraints = {
        echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1,
      };
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
      await resumed;
      await this.ctx.audioWorklet.addModule(workletUrl);
      const sr = this.ctx.sampleRate;
      this.ring = new RingBuffer(sr);
      this.detector = new OnsetDetector(sr);
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.node = new AudioWorkletNode(this.ctx, 'capture-processor', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
      this.node.port.onmessage = (e: MessageEvent<{ samples: Float32Array }>) => this.onBlock(e.data.samples);
      const mute = this.ctx.createGain();
      mute.gain.value = 0;
      // Route through a zero-gain node to the destination so Safari keeps pulling audio.
      src.connect(this.node).connect(mute).connect(this.ctx.destination);
      this.ctx.onstatechange = () => this.syncInfo('running');
      this.stream.getAudioTracks()[0]?.addEventListener('ended', () => this.setInfo({ state: 'suspended' }));
      this.syncInfo('running');
    } catch (err) {
      this.setInfo({ state: 'error', error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
      this.teardown();
    }
  }

  private syncInfo(state: EngineState): void {
    const track = this.stream?.getAudioTracks()[0];
    const ctxState = this.ctx?.state ?? 'closed';
    this.setInfo({
      state: ctxState === 'running' ? state : 'suspended',
      contextState: ctxState,
      sampleRate: this.ctx?.sampleRate ?? 0,
      baseLatencyMs: (this.ctx?.baseLatency ?? 0) * 1000,
      trackSettings: track?.getSettings() ?? null,
      trackConstraints: track?.getConstraints() ?? null,
    });
  }

  /** Tap handler for "resume" after iOS interrupts the context (call, lock). */
  async resume(): Promise<void> {
    await this.ctx?.resume();
    this.syncInfo('running');
  }

  stop(): void {
    this.teardown();
    this.setInfo({ state: 'idle', contextState: 'closed' });
  }

  private teardown(): void {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.node = null;
    this.stream = null;
    this.ctx = null;
  }

  private onBlock(block: Float32Array): void {
    const ring = this.ring, det = this.detector;
    if (!ring || !det) return;
    let peak = 0, sum = 0;
    for (let i = 0; i < block.length; i++) {
      const v = Math.abs(block[i]!);
      if (v > peak) peak = v;
      sum += v * v;
    }
    this.level = { peak, rms: Math.sqrt(sum / block.length) };
    ring.write(block);
    if (this.recording) {
      this.recording.chunks.push(block);
      this.recording.remaining -= block.length;
      if (this.recording.remaining <= 0) {
        const rec = this.recording;
        this.recording = null;
        const out = new Float32Array(rec.chunks.reduce((n, c) => n + c.length, 0));
        let o = 0;
        for (const c of rec.chunks) { out.set(c, o); o += c.length; }
        rec.resolve(out);
      }
    }
    for (const onset of det.process(block)) this.onsetCount++, this.pending.push({ onset, at: Date.now(), analysed: false, saved: false });
    this.servicePending(ring);
    this.emit();
  }

  private servicePending(ring: RingBuffer): void {
    const sr = ring.sampleRate;
    for (const p of this.pending) {
      const start = p.onset.frameStart - Math.round(PRE_S * sr);
      if (!p.analysed && ring.writeIndex >= p.onset.frameStart + Math.round(ANALYSE_AFTER_S * sr)) {
        const post = Math.round(ANALYSE_AFTER_S * sr);
        const seg = new Float32Array(Math.round(PRE_S * sr) + post);
        const segStart = p.onset.frameStart - Math.round(PRE_S * sr);
        if (ring.readRange(segStart, seg.length, seg) === 'ok') {
          const calibrating = this.mode === 'calibrate';
          const rel = { ...p.onset, frameStart: Math.round(PRE_S * sr), frameEnd: Math.round(PRE_S * sr) + this.detector!.frameSize };
          const ev0 = evaluateOnset(seg, sr, rel, this.profile, { skipTolerance: calibrating, preMs: PRE_S * 1000 });
          if (ev0) {
            const ev: CapturedEvent = { id: this.nextId++, at: p.at, onset: p.onset, analysis: ev0.analysis, verdict: ev0.verdict, calibrating };
            this.events = [ev, ...this.events].slice(0, 30);
            for (const fn of this.eventListeners) fn(ev);
          }
        }
        p.analysed = true;
      }
      if (!p.saved && ring.writeIndex >= p.onset.frameStart + Math.round(SNAPSHOT_AFTER_S * sr)) {
        const seg = new Float32Array(Math.round((PRE_S + SNAPSHOT_AFTER_S) * sr));
        if (ring.readRange(start, seg.length, seg) === 'ok') {
          this.snapshots = [{ id: this.nextId++, at: p.at, sampleRate: sr, samples: seg }, ...this.snapshots].slice(0, 8);
        }
        p.saved = true;
      }
    }
    this.pending = this.pending.filter((p) => !p.analysed || !p.saved);
  }

  /** Last `seconds` of audio from the ring (max 2 s). */
  lastCapture(seconds = 2): Float32Array | null {
    const ring = this.ring;
    if (!ring) return null;
    const n = Math.min(ring.capacity, Math.round(seconds * ring.sampleRate), ring.writeIndex - ring.startIndex);
    if (n <= 0) return null;
    const out = new Float32Array(n);
    return ring.readLatest(n, out) === 'ok' ? out : null;
  }

  /** Record the next `seconds` of audio (used for a long, continuous capture). */
  recordNext(seconds: number): Promise<Float32Array> {
    const sr = this.ring?.sampleRate ?? 48000;
    return new Promise((resolve) => {
      this.recording = { chunks: [], remaining: Math.round(seconds * sr), resolve };
      this.emit();
    });
  }
  get isRecording(): boolean {
    return this.recording !== null;
  }
}

export const engine = new CaptureEngine();
