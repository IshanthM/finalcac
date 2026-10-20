/**
 * Analysis windows.
 *
 * Stage A uses a *periodic* Hann window (DFT-even): `w[n] = 0.5 - 0.5 cos(2 pi n / N)` for
 * `n = 0..N-1`. Unlike the symmetric form, its DFT has exactly three non-zero bins
 * (N/2 at bin 0 and -N/4 at bins +-1), so a sinusoid centred on a bin leaks into exactly its two
 * neighbours and the identities below hold exactly:
 *
 * - sum(w)    = N / 2           -> coherent gain   = sum(w) / N = 0.5
 * - sum(w^2)  = 3N / 8 (N >= 3) -> equivalent noise bandwidth
 *                                  ENBW = N sum(w^2) / sum(w)^2 = 1.5 bins
 */

/** A window together with the sums that spectral scaling needs. */
export interface SpectralWindow {
  /** Window length N in samples. */
  readonly length: number;
  /** Window samples. Treat as read-only; the object may be shared. */
  readonly values: Float64Array;
  /** sum(w): sets the gain applied to a sinusoid (coherent gain times N). */
  readonly sum: number;
  /** sum(w^2): sets the gain applied to broadband noise. */
  readonly sumOfSquares: number;
  /** sum(w) / N. A windowed on-bin sinusoid of amplitude A peaks at A * N * coherentGain / 2. */
  readonly coherentGain: number;
  /** Equivalent noise bandwidth in bins: N * sum(w^2) / sum(w)^2. Multiply by fs/N for hertz. */
  readonly enbwBins: number;
}

/** Coherent gain of the periodic Hann window (exact). */
export const HANN_COHERENT_GAIN = 0.5;
/** Equivalent noise bandwidth of the periodic Hann window in bins (exact for N >= 3). */
export const HANN_ENBW_BINS = 1.5;

/** Builds a `SpectralWindow` from arbitrary window samples. */
export function describeWindow(values: Float64Array): SpectralWindow {
  const length = values.length;
  if (length === 0) throw new RangeError('window must have at least one sample');
  let sum = 0;
  let sumOfSquares = 0;
  for (let n = 0; n < length; n++) {
    const w = values[n]!;
    sum += w;
    sumOfSquares += w * w;
  }
  if (sum === 0) throw new RangeError('window samples must not sum to zero');
  return {
    length,
    values,
    sum,
    sumOfSquares,
    coherentGain: sum / length,
    enbwBins: (length * sumOfSquares) / (sum * sum),
  };
}

/** Periodic (DFT-even) Hann window samples of length `length`. */
export function hannPeriodicValues(length: number): Float64Array {
  if (!Number.isInteger(length) || length < 2) {
    throw new RangeError(`window length must be an integer >= 2, got ${String(length)}`);
  }
  const values = new Float64Array(length);
  const step = (2 * Math.PI) / length;
  for (let n = 0; n < length; n++) values[n] = 0.5 - 0.5 * Math.cos(step * n);
  return values;
}

const hannCache = new Map<number, SpectralWindow>();

/**
 * Periodic Hann window of length `length`, with its sums. Results are cached per length and
 * shared, so never write to `values`.
 */
export function hannWindow(length: number): SpectralWindow {
  let window = hannCache.get(length);
  if (window === undefined) {
    window = describeWindow(hannPeriodicValues(length));
    hannCache.set(length, window);
  }
  return window;
}
