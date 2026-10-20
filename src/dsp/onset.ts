/** Streaming onset detector: band energy vs an adaptive floor. Pure (no DOM), sample-rate aware. */
import { RealFftPlan } from './fft.ts';
import { hannWindow } from './window.ts';
import { PARAMS } from './params.ts';
import { nextPowerOfTwo } from './peak.ts';

export interface Onset {
  /** Absolute sample index of the END of the frame that crossed the threshold. */
  frameEnd: number;
  /** Absolute index of the START of that frame (the click began somewhere inside it or just before). */
  frameStart: number;
  bandDb: number;
  floorDb: number;
}

export interface OnsetOptions {
  bandLoHz?: number;
  bandHiHz?: number;
  riseDb?: number;
  endDb?: number;
  refractoryMs?: number;
}

const EPS = 1e-30;

export class OnsetDetector {
  readonly frameSize: number;
  readonly hop: number;
  readonly sampleRate: number;
  /** Latest band energy and floor (dB), for meters. */
  bandDb = -200;
  floorDb = -200;

  private readonly plan: RealFftPlan;
  private readonly window: Float64Array;
  private readonly power: Float64Array;
  private readonly frame: Float64Array;
  private readonly kLo: number;
  private readonly kHi: number;
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
  private floorLin = 0;
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
    this.kLo = Math.max(1, Math.ceil((opts.bandLoHz ?? PARAMS.bandLoHz) / binHz));
    this.kHi = Math.min(this.plan.binCount - 2, Math.floor((opts.bandHiHz ?? PARAMS.bandHiHz) / binHz));
    this.riseDb = opts.riseDb ?? PARAMS.onsetRiseDb;
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
    let e = 0;
    for (let k = this.kLo; k <= this.kHi; k++) e += this.power[k]!;
    this.hopsSeen++;
    this.bandDb = 10 * Math.log10(e + EPS);
    if (this.hopsSeen <= this.warmupHops) {
      // Warm-up: running mean sets the floor quickly; nothing fires.
      this.floorLin += (e - this.floorLin) / this.hopsSeen;
      this.floorDb = 10 * Math.log10(this.floorLin + EPS);
      return null;
    }
    const floorDb = 10 * Math.log10(this.floorLin + EPS);
    this.floorDb = floorDb;
    let onset: Onset | null = null;
    if (this.cooldown > 0) this.cooldown--;
    if (!this.inEvent) {
      if (this.cooldown === 0 && this.bandDb > floorDb + this.riseDb) {
        this.inEvent = true;
        this.cooldown = this.refractoryHops;
        onset = { frameEnd: this.written, frameStart: this.written - n, bandDb: this.bandDb, floorDb };
      } else {
        this.floorLin += this.alphaSlow * (e - this.floorLin);
      }
    } else if (this.bandDb < floorDb + this.endDb) {
      this.inEvent = false; // floor stays frozen through the event
    }
    return onset;
  }
}
