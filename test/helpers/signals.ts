/** Reference implementations and signal builders shared by the core tests. */

/** x[n] = amplitude * sin(2 pi cycles n / length + phase): `cycles` periods per `length`. */
export function sinusoid(
  length: number,
  cycles: number,
  amplitude = 1,
  phase = 0,
): Float64Array {
  const out = new Float64Array(length);
  for (let n = 0; n < length; n++) {
    out[n] = amplitude * Math.sin((2 * Math.PI * cycles * n) / length + phase);
  }
  return out;
}

/** O(N^2) DFT with exactly reduced angles, the reference the FFT is tested against. */
export function naiveDft(re: Float64Array, im: Float64Array): { re: Float64Array; im: Float64Array } {
  const n = re.length;
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let sr = 0;
    let si = 0;
    for (let t = 0; t < n; t++) {
      // Reduce k*t modulo n before scaling so the angle stays small and exact.
      const angle = (-2 * Math.PI * ((k * t) % n)) / n;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const xr = re[t]!;
      const xi = im[t]!;
      sr += xr * c - xi * s;
      si += xr * s + xi * c;
    }
    outRe[k] = sr;
    outIm[k] = si;
  }
  return { re: outRe, im: outIm };
}

/** ||a - b|| / ||b|| over complex vectors (b is the reference). */
export function relativeError(
  aRe: ArrayLike<number>,
  aIm: ArrayLike<number>,
  bRe: ArrayLike<number>,
  bIm: ArrayLike<number>,
  length = bRe.length,
): number {
  let diff = 0;
  let ref = 0;
  for (let i = 0; i < length; i++) {
    const dr = aRe[i]! - bRe[i]!;
    const di = aIm[i]! - bIm[i]!;
    diff += dr * dr + di * di;
    ref += bRe[i]! * bRe[i]! + bIm[i]! * bIm[i]!;
  }
  return Math.sqrt(diff / ref);
}

/** Index of the largest element. */
export function argMax(values: ArrayLike<number>): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (values[i]! > values[best]!) best = i;
  return best;
}

/** Arithmetic mean of values[from .. to). */
export function mean(values: ArrayLike<number>, from = 0, to = values.length): number {
  let sum = 0;
  for (let i = from; i < to; i++) sum += values[i]!;
  return sum / (to - from);
}

/** All powers of two from `from` to `to` inclusive. */
export function powersOfTwo(from: number, to: number): number[] {
  const sizes: number[] = [];
  for (let n = from; n <= to; n *= 2) sizes.push(n);
  return sizes;
}
