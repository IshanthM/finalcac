/**
 * Radix-2 FFTs with cached plans.
 *
 * - `FftPlan`: iterative, in-place, decimation-in-time complex FFT of any power-of-two size.
 *   The plan holds the bit-reversal permutation and the twiddle factors for its size.
 * - `RealFftPlan`: FFT of a real signal of length N computed with one N/2-point complex FFT
 *   (even samples in the real part, odd samples in the imaginary part) and a split step. It
 *   returns bins 0..N/2 (the one-sided half; the rest is the complex conjugate mirror).
 *
 * Conventions: forward `X[k] = sum_n x[n] exp(-2 pi i k n / N)`, unnormalised. The complex
 * inverse divides by N, so `inverse(forward(x)) = x`. Real-input outputs are raw: no window
 * correction, no 1/N, no doubling. Scaling to dBFS lives in `spectrum.ts`.
 *
 * Hot path: `forward`, `inverse` and `power` never allocate. Callers pass the output buffers,
 * and each `RealFftPlan` owns its scratch. JavaScript runs one call at a time per thread (each
 * Web Worker has its own module instance), so shared plans are safe.
 */

/** Real input accepted by the real-FFT path. */
export type RealSignal = Float32Array | Float64Array;

/** Largest supported transform length (2^30). */
export const MAX_FFT_SIZE = 2 ** 30;

/** True when `n` is a positive integer power of two no larger than MAX_FFT_SIZE. */
export function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= MAX_FFT_SIZE && (n & (n - 1)) === 0;
}

function assertLength(name: string, actual: number, expected: number): void {
  if (actual !== expected) {
    throw new RangeError(`${name} must have length ${String(expected)}, got ${String(actual)}`);
  }
}

const complexPlans = new Map<number, FftPlan>();
const realPlans = new Map<number, RealFftPlan>();

/** Complex FFT plan for one power-of-two size. Get instances from `FftPlan.forSize`. */
export class FftPlan {
  /** Transform length N. */
  readonly size: number;
  /** log2(N). */
  readonly log2Size: number;
  private readonly bitReversed: Uint32Array;
  /** cos(2 pi k / N) for k = 0..N/2-1. */
  private readonly cosTable: Float64Array;
  /** sin(2 pi k / N) for k = 0..N/2-1. */
  private readonly sinTable: Float64Array;

  private constructor(size: number) {
    this.size = size;
    this.log2Size = Math.round(Math.log2(size));
    const bits = this.log2Size;
    const rev = new Uint32Array(size);
    for (let i = 1; i < size; i++) {
      rev[i] = (rev[i >> 1]! >> 1) | ((i & 1) << (bits - 1));
    }
    this.bitReversed = rev;
    const half = size >> 1;
    this.cosTable = new Float64Array(half);
    this.sinTable = new Float64Array(half);
    for (let k = 0; k < half; k++) {
      const angle = (2 * Math.PI * k) / size;
      this.cosTable[k] = Math.cos(angle);
      this.sinTable[k] = Math.sin(angle);
    }
  }

  /** Cached plan for `size` (a power of two). Builds it on first use. */
  static forSize(size: number): FftPlan {
    let plan = complexPlans.get(size);
    if (plan === undefined) {
      if (!isPowerOfTwo(size)) {
        throw new RangeError(`FFT size must be a power of two in [1, 2^30], got ${String(size)}`);
      }
      plan = new FftPlan(size);
      complexPlans.set(size, plan);
    }
    return plan;
  }

  /** In-place forward transform of (re, im). Unnormalised. */
  forward(re: Float64Array, im: Float64Array): void {
    this.transform(re, im, -1);
  }

  /** In-place inverse transform of (re, im), scaled by 1/N. */
  inverse(re: Float64Array, im: Float64Array): void {
    this.transform(re, im, 1);
    const scale = 1 / this.size;
    for (let i = 0; i < this.size; i++) {
      re[i] = re[i]! * scale;
      im[i] = im[i]! * scale;
    }
  }

  /** `sign` is the exponent sign: -1 forward, +1 inverse (unscaled). */
  private transform(re: Float64Array, im: Float64Array, sign: -1 | 1): void {
    const n = this.size;
    assertLength('re', re.length, n);
    assertLength('im', im.length, n);

    const rev = this.bitReversed;
    for (let i = 0; i < n; i++) {
      const j = rev[i]!;
      if (j > i) {
        const tr = re[i]!;
        re[i] = re[j]!;
        re[j] = tr;
        const ti = im[i]!;
        im[i] = im[j]!;
        im[j] = ti;
      }
    }

    const cos = this.cosTable;
    const sin = this.sinTable;
    // Butterfly stages: sub-transforms of length 2*half; twiddle index advances by `stride`.
    for (let half = 1, stride = n >> 1; half < n; half <<= 1, stride >>= 1) {
      const span = half << 1;
      for (let start = 0; start < n; start += span) {
        for (let j = 0, t = 0; j < half; j++, t += stride) {
          const wr = cos[t]!;
          const wi = sign * sin[t]!;
          const a = start + j;
          const b = a + half;
          const br = re[b]!;
          const bi = im[b]!;
          const tr = wr * br - wi * bi;
          const ti = wr * bi + wi * br;
          const ar = re[a]!;
          const ai = im[a]!;
          re[b] = ar - tr;
          im[b] = ai - ti;
          re[a] = ar + tr;
          im[a] = ai + ti;
        }
      }
    }
  }
}

/**
 * FFT of a real signal of length N (a power of two, N >= 2), returning bins 0..N/2.
 * Get instances from `RealFftPlan.forSize`.
 */
export class RealFftPlan {
  /** Real input length N. */
  readonly size: number;
  /** Number of one-sided output bins, N/2 + 1 (DC through Nyquist). */
  readonly binCount: number;
  private readonly halfPlan: FftPlan;
  private readonly zRe: Float64Array;
  private readonly zIm: Float64Array;
  /** cos(2 pi k / N) for k = 0..N/2. */
  private readonly cosTable: Float64Array;
  /** sin(2 pi k / N) for k = 0..N/2. */
  private readonly sinTable: Float64Array;

  private constructor(size: number) {
    this.size = size;
    const half = size >> 1;
    this.binCount = half + 1;
    this.halfPlan = FftPlan.forSize(half);
    this.zRe = new Float64Array(half);
    this.zIm = new Float64Array(half);
    this.cosTable = new Float64Array(half + 1);
    this.sinTable = new Float64Array(half + 1);
    for (let k = 0; k <= half; k++) {
      const angle = (2 * Math.PI * k) / size;
      this.cosTable[k] = Math.cos(angle);
      this.sinTable[k] = Math.sin(angle);
    }
  }

  /** Cached plan for real input of length `size` (a power of two >= 2). */
  static forSize(size: number): RealFftPlan {
    let plan = realPlans.get(size);
    if (plan === undefined) {
      if (!isPowerOfTwo(size) || size < 2) {
        throw new RangeError(
          `real FFT size must be a power of two in [2, 2^30], got ${String(size)}`,
        );
      }
      plan = new RealFftPlan(size);
      realPlans.set(size, plan);
    }
    return plan;
  }

  /**
   * One-sided spectrum X[0..N/2] of `input` (multiplied sample-by-sample by `window` when one
   * is given). `outRe` and `outIm` must have length N/2 + 1. X[0] and X[N/2] are real.
   */
  forward(
    input: RealSignal,
    outRe: Float64Array,
    outIm: Float64Array,
    window?: Float64Array,
  ): void {
    assertLength('outRe', outRe.length, this.binCount);
    assertLength('outIm', outIm.length, this.binCount);
    this.packAndTransform(input, window);
    const half = this.size >> 1;
    const zr = this.zRe;
    const zi = this.zIm;
    const cos = this.cosTable;
    const sin = this.sinTable;
    const r0 = zr[0]!;
    const i0 = zi[0]!;
    outRe[0] = r0 + i0;
    outIm[0] = 0;
    outRe[half] = r0 - i0;
    outIm[half] = 0;
    for (let k = 1; k < half; k++) {
      const zkr = zr[k]!;
      const zki = zi[k]!;
      const zmr = zr[half - k]!;
      const zmi = zi[half - k]!;
      // Even-sample spectrum E = (Z[k] + conj Z[M-k]) / 2, odd-sample spectrum
      // O = (Z[k] - conj Z[M-k]) / 2i, and X[k] = E + exp(-2 pi i k / N) * O.
      const er = 0.5 * (zkr + zmr);
      const ei = 0.5 * (zki - zmi);
      const or = 0.5 * (zki + zmi);
      const oi = 0.5 * (zmr - zkr);
      const c = cos[k]!;
      const s = sin[k]!;
      outRe[k] = er + c * or + s * oi;
      outIm[k] = ei + c * oi - s * or;
    }
  }

  /**
   * Raw one-sided power |X[k]|^2 for k = 0..N/2 of `input` (windowed when `window` is given).
   * No normalisation and no doubling: `spectrum.ts` applies the dBFS conventions.
   * `out` must have length N/2 + 1.
   */
  power(input: RealSignal, out: Float64Array, window?: Float64Array): void {
    assertLength('out', out.length, this.binCount);
    this.packAndTransform(input, window);
    const half = this.size >> 1;
    const zr = this.zRe;
    const zi = this.zIm;
    const cos = this.cosTable;
    const sin = this.sinTable;
    const r0 = zr[0]!;
    const i0 = zi[0]!;
    const dc = r0 + i0;
    const nyquist = r0 - i0;
    out[0] = dc * dc;
    out[half] = nyquist * nyquist;
    for (let k = 1; k < half; k++) {
      const zkr = zr[k]!;
      const zki = zi[k]!;
      const zmr = zr[half - k]!;
      const zmi = zi[half - k]!;
      const er = 0.5 * (zkr + zmr);
      const ei = 0.5 * (zki - zmi);
      const or = 0.5 * (zki + zmi);
      const oi = 0.5 * (zmr - zkr);
      const c = cos[k]!;
      const s = sin[k]!;
      const xr = er + c * or + s * oi;
      const xi = ei + c * oi - s * or;
      out[k] = xr * xr + xi * xi;
    }
  }

  /** Packs x[2m] + i x[2m+1] (optionally windowed) and runs the N/2-point complex FFT. */
  private packAndTransform(input: RealSignal, window: Float64Array | undefined): void {
    assertLength('input', input.length, this.size);
    const half = this.size >> 1;
    const zr = this.zRe;
    const zi = this.zIm;
    if (window === undefined) {
      for (let m = 0; m < half; m++) {
        zr[m] = input[2 * m]!;
        zi[m] = input[2 * m + 1]!;
      }
    } else {
      assertLength('window', window.length, this.size);
      for (let m = 0; m < half; m++) {
        const e = 2 * m;
        zr[m] = input[e]! * window[e]!;
        zi[m] = input[e + 1]! * window[e + 1]!;
      }
    }
    this.halfPlan.forward(zr, zi);
  }
}
