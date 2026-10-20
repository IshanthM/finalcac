/** Streaming onset detector: band energy vs adaptive floors in one or more bands. Pure (no DOM), sample-rate aware. */
import { RealFftPlan } from './fft.ts';
import { hannWindow } from './window.ts';
import { PARAMS } from './params.ts';
import { nextPowerOfTwo } from './peak.ts';

export interface Onset {
  /** Absolute sample index of the END of the frame that crossed the threshold. */
  frameEnd: number;
  /** Absolute index of the START of that frame (the click began somewhere inside it or just before). */
  frameStart: number;
  /** Energy and floor (dB) of the band that rose the most above its floor. */
  bandDb: number;
  floorDb: number;
}

export interface BandSpec {
  loHz: number;
  hiHz: number;
  /** Rise over this band's floor that counts as an onset (dB). Defaults to OnsetOptions.riseDb. */
  riseDb?: number;
}

export interface OnsetOptions {
  /** Bands to watch. The first is the "wide" band shown on meters. Default: 9–15.5 kHz plus overlapping sub-bands tiling it. */
  bands?: BandSpec[];
  riseDb?: number;
  endDb?: number;
  refractoryMs?: number;
}

const EPS = 1e-30;

export function defaultBands(): BandSpec[] {
  const bands: BandSpec[] = [{ loHz: PARAMS.bandLoHz, hiHz: PARAMS.bandHiHz }];
  const width = PARAMS.tileWidthFrac * PARAMS.nominalToneHz;
  for (let lo = PARAMS.bandLoHz; lo + width <= PARAMS.bandHiHz + 1; lo += width / 2) {
    bands.push({ loHz: lo, hiHz: lo + width, riseDb: PARAMS.tileRiseDb });
  }
  return bands;
}

export class OnsetDetector {
  readonly frameSize: number;
  readonly hop: number;
  readonly sampleRate: number;
  /** Latest energy and floor (dB) of the first (wide) band, for meters. */
  bandDb = -200;
  floorDb = -200;

  private readonly plan: RealFftPlan;
  private readonly window: Float64Array;
  private readonly power: Float64Array;
  private readonly frame: Float64Array;
  private readonly kRanges: { lo: number; hi: number }[];
  private readonly floors: Float64Array;
  private readonly thresholds: Float64Array;
  private readonly riseDb: number;
  private readonly endDb: number;
  private readonly refractoryHops: number;
  private readonly warmupHops: number;
  private readonly alphaSlow: number;
  private readonly ring: Float32Array;
  private ringPos = 0;
  private filled = 0;
  private sinceHop = 0;
  private written = 0;
  private hopsSeen = 0;
  private inEvent = false;
  private cooldown = 0;

  constructor(sampleRate: number, opts: OnsetOptions = {}) {
    this.sampleRate = sampleRate;
    this.frameSize = Math.max(64, nextPowerOfTwo(Math.round(sampleRate * 0.005)));
    this.hop = this.frameSize / 2;
    this.plan = RealFftPlan.forSize(this.frameSize);
    this.window = hannWindow(this.frameSize).values;
    this.power = new Float64Array(this.plan.binCount);
    this.frame = new Float64Array(this.frameSize);
    this.ring = new Float32Array(this.frameSize);
    const binHz = sampleRate / this.frameSize;
    const bands = opts.bands ?? defaultBands();
    this.kRanges = bands.map((b) => ({
      lo: Math.max(1, Math.ceil(b.loHz / binHz)),
      hi: Math.min(this.plan.binCount - 2, Math.max(Math.ceil(b.loHz / binHz), Math.floor(b.hiHz / binHz))),
    }));
    this.floors = new Float64Array(bands.length);
    this.riseDb = opts.riseDb ?? PARAMS.onsetRiseDb;
    this.thresholds = Float64Array.from(bands.map((b) => b.riseDb ?? this.riseDb));
    this.endDb = opts.endDb ?? PARAMS.eventEndDb;
    const hopS = this.hop / sampleRate;
    this.refractoryHops = Math.ceil((opts.refractoryMs ?? PARAMS.refractoryMs) / 1000 / hopS);
    this.warmupHops = Math.ceil(PARAMS.floorWarmupS / hopS);
    this.alphaSlow = Math.min(1, hopS / PARAMS.floorTauS);
  }

  /** Feed samples; returns onsets found in this chunk (usually none). */
  process(chunk: Float32Array): Onset[] {
    const out: Onset[] = [];
    for (let i = 0; i < chunk.length; i++) {
      this.ring[this.ringPos] = chunk[i]!;
      this.ringPos = (this.ringPos + 1) % this.frameSize;
      this.written++;
      if (this.filled < this.frameSize) this.filled++;
      if (this.filled === this.frameSize && ++this.sinceHop >= this.hop) {
        this.sinceHop = 0;
        const onset = this.step();
        if (onset) out.push(onset);
      }
    }
    return out;
  }

  private step(): Onset | null {
    const n = this.frameSize;
    for (let i = 0; i < n; i++) this.frame[i] = this.ring[(this.ringPos + i) % n]!;
    this.plan.power(this.frame, this.power, this.window);
    const nb = this.kRanges.length;
    const e = new Float64Array(nb);
    for (let b = 0; b < nb; b++) {
      const r = this.kRanges[b]!;
      let sum = 0;
      for (let k = r.lo; k <= r.hi; k++) sum += this.power[k]!;
      e[b] = sum;
    }
    this.hopsSeen++;
    this.bandDb = 10 * Math.log10(e[0]! + EPS);
    if (this.hopsSeen <= this.warmupHops) {
      // Warm-up: running mean sets each floor quickly; nothing fires.
      for (let b = 0; b < nb; b++) this.floors[b]! += (e[b]! - this.floors[b]!) / this.hopsSeen;
      this.floorDb = 10 * Math.log10(this.floors[0]! + EPS);
      return null;
    }
    this.floorDb = 10 * Math.log10(this.floors[0]! + EPS);
    if (this.cooldown > 0) this.cooldown--;
    let bestMargin = -Infinity, bestBand = 0, bestRise = 0;
    let allQuiet = true;
    for (let b = 0; b < nb; b++) {
      const rise = 10 * Math.log10(e[b]! + EPS) - 10 * Math.log10(this.floors[b]! + EPS);
      const margin = rise - this.thresholds[b]!;
      if (margin > bestMargin) { bestMargin = margin; bestBand = b; bestRise = rise; }
      if (rise >= this.endDb) allQuiet = false;
    }
    let onset: Onset | null = null;
    if (!this.inEvent) {
      if (this.cooldown === 0 && bestMargin > 0) {
        this.inEvent = true;
        this.cooldown = this.refractoryHops;
        const fdb = 10 * Math.log10(this.floors[bestBand]! + EPS);
        onset = { frameEnd: this.written, frameStart: this.written - n, bandDb: fdb + bestRise, floorDb: fdb };
      } else {
        for (let b = 0; b < nb; b++) this.floors[b]! += this.alphaSlow * (e[b]! - this.floors[b]!);
      }
    } else if (allQuiet) {
      this.inEvent = false; // floors stay frozen through the event
    }
    return onset;
  }
}
