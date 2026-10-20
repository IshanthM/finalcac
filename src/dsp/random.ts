/**
 * Small seeded random sources, so tests and generated fixtures are identical on every machine.
 * Not for cryptography.
 */

/** A source of uniform numbers in [0, 1). */
export type UniformSource = () => number;

/**
 * Mulberry32: a fast 32-bit generator with a full 2^32 period, plenty for test signals.
 * The same seed always yields the same sequence.
 */
export function createRandom(seed: number): UniformSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal samples (mean 0, variance 1) from `uniform`, by the Box-Muller transform. */
export function createGaussian(uniform: UniformSource): () => number {
  let spare: number | undefined;
  return () => {
    if (spare !== undefined) {
      const value = spare;
      spare = undefined;
      return value;
    }
    const u1 = 1 - uniform(); // (0, 1], so the logarithm is finite
    const u2 = uniform();
    const radius = Math.sqrt(-2 * Math.log(u1));
    const angle = 2 * Math.PI * u2;
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}

/** `length` samples of white Gaussian noise with RMS `rms`, from a fixed seed. */
export function whiteNoise(length: number, rms: number, seed: number): Float32Array {
  const gaussian = createGaussian(createRandom(seed));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = rms * gaussian();
  return out;
}
