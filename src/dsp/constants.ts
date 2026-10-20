/** Shared DSP constants. Durations are seconds; `secondsToSamples` is the only seconds→samples conversion. */

/** Length of the capture ring buffer (seconds). */
export const RING_BUFFER_S = 2.0;

/** Lowest and highest sample rates the DSP accepts (Hz). */
export const MIN_SAMPLE_RATE = 8000;
export const MAX_SAMPLE_RATE = 192000;

export function assertSampleRate(sampleRate: number): void {
  if (!Number.isFinite(sampleRate) || sampleRate < MIN_SAMPLE_RATE || sampleRate > MAX_SAMPLE_RATE) {
    throw new RangeError(`unsupported sample rate: ${String(sampleRate)}`);
  }
}

/** `Math.round(seconds * sampleRate)`. Throws on a negative/non-finite duration or unsupported rate. */
export function secondsToSamples(seconds: number, sampleRate: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError(`seconds must be a finite, non-negative duration, got ${String(seconds)}`);
  }
  assertSampleRate(sampleRate);
  return Math.round(seconds * sampleRate);
}
