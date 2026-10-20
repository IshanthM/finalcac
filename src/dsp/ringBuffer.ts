/**
 * Float32 ring buffer addressed by absolute sample index.
 *
 * Every sample ever written has an absolute index: the first sample written gets `startIndex`
 * (0 by default) and each later sample the next integer. Indices are plain numbers and stay
 * exact up to Number.MAX_SAFE_INTEGER (2^53 - 1), about 5,900 years of audio at 48 kHz; a
 * write that would pass that limit throws. The buffer keeps the newest `capacity` samples,
 * so the STFT framer, the clip cutter and the probe can all ask for "samples [a, a + n)" and
 * learn whether those samples are still held, already overwritten, or not written yet.
 *
 * `write`, `readRange` and `readLatest` never allocate.
 */

import { RING_BUFFER_S, secondsToSamples } from './constants.ts';

/** Outcome of a read. Only `'ok'` means `out` was filled. */
export type RingReadStatus = 'ok' | 'overwritten' | 'not-yet-written';

export interface RingBufferOptions {
  /** Capacity in seconds, converted with `secondsToSamples`. Defaults to RING_BUFFER_S. */
  readonly seconds?: number;
  /**
   * Absolute index given to the first sample written (default 0). Samples before it count as
   * already overwritten. Useful for aligning with an external clock, and in tests.
   */
  readonly startIndex?: number;
}

export class RingBuffer {
  /** Sample rate the capacity was computed for (Hz). */
  readonly sampleRate: number;
  /** Number of samples held once the buffer has filled. */
  readonly capacity: number;
  /** Absolute index of the first sample written. */
  readonly startIndex: number;
  private readonly data: Float32Array;
  /** Absolute index one past the newest sample. */
  private end: number;

  constructor(sampleRate: number, options: RingBufferOptions = {}) {
    const seconds = options.seconds ?? RING_BUFFER_S;
    const startIndex = options.startIndex ?? 0;
    const capacity = secondsToSamples(seconds, sampleRate);
    if (capacity < 1) {
      throw new RangeError(`ring buffer must hold at least one sample, got ${String(seconds)} s`);
    }
    if (!Number.isSafeInteger(startIndex) || startIndex < 0) {
      throw new RangeError(`startIndex must be a non-negative safe integer, got ${String(startIndex)}`);
    }
    this.sampleRate = sampleRate;
    this.capacity = capacity;
    this.startIndex = startIndex;
    this.data = new Float32Array(capacity);
    this.end = startIndex;
  }

  /** Absolute index the next written sample will get (one past the newest sample). */
  get writeIndex(): number {
    return this.end;
  }

  /** Absolute index of the oldest sample still held (equals `writeIndex` when empty). */
  get oldestIndex(): number {
    return Math.max(this.startIndex, this.end - this.capacity);
  }

  /** Number of samples currently held. */
  get size(): number {
    return this.end - this.oldestIndex;
  }

  /** Total samples written since construction. */
  get totalWritten(): number {
    return this.end - this.startIndex;
  }

  /**
   * Appends `chunk`. A chunk longer than the capacity keeps only its newest `capacity` samples,
   * but every sample still advances the absolute index.
   */
  write(chunk: Float32Array): void {
    const length = chunk.length;
    if (length === 0) return;
    if (this.end + length > Number.MAX_SAFE_INTEGER) {
      throw new RangeError('absolute sample index would exceed Number.MAX_SAFE_INTEGER');
    }
    const capacity = this.capacity;
    const data = this.data;
    const skip = length > capacity ? length - capacity : 0;
    let position = (this.end + skip) % capacity;
    let i = skip;
    while (i < length) {
      const run = Math.min(length - i, capacity - position);
      for (let k = 0; k < run; k++) data[position + k] = chunk[i + k]!;
      i += run;
      position += run;
      if (position === capacity) position = 0;
    }
    this.end += length;
  }

  /**
   * Copies samples [absStart, absStart + length) into `out[0 .. length)`.
   *
   * Returns `'overwritten'` when any of the range is older than `oldestIndex` (no longer
   * held), `'not-yet-written'` when any of it is at or after `writeIndex`, and `'ok'` after
   * copying. `out` is untouched unless the result is `'ok'`.
   *
   * @throws RangeError for a negative or non-integer range, a range longer than the capacity
   * (it could never be satisfied), or an `out` shorter than `length`.
   */
  readRange(absStart: number, length: number, out: Float32Array): RingReadStatus {
    if (!Number.isSafeInteger(absStart) || absStart < 0) {
      throw new RangeError(`absStart must be a non-negative safe integer, got ${String(absStart)}`);
    }
    if (!Number.isInteger(length) || length < 0) {
      throw new RangeError(`length must be a non-negative integer, got ${String(length)}`);
    }
    if (length > this.capacity) {
      throw new RangeError(
        `length ${String(length)} exceeds the ring capacity of ${String(this.capacity)} samples`,
      );
    }
    if (out.length < length) {
      throw new RangeError(`out holds ${String(out.length)} samples, need ${String(length)}`);
    }
    if (absStart < this.oldestIndex) return 'overwritten';
    if (absStart + length > this.end) return 'not-yet-written';

    const capacity = this.capacity;
    const data = this.data;
    let position = absStart % capacity;
    let i = 0;
    while (i < length) {
      const run = Math.min(length - i, capacity - position);
      for (let k = 0; k < run; k++) out[i + k] = data[position + k]!;
      i += run;
      position += run;
      if (position === capacity) position = 0;
    }
    return 'ok';
  }

  /**
   * Copies the newest `length` samples into `out[0 .. length)`; they start at absolute index
   * `writeIndex - length`. Returns `'not-yet-written'` while fewer than `length` samples exist.
   */
  readLatest(length: number, out: Float32Array): RingReadStatus {
    if (!Number.isInteger(length) || length < 0) {
      throw new RangeError(`length must be a non-negative integer, got ${String(length)}`);
    }
    if (length > this.size) {
      if (length > this.capacity) {
        throw new RangeError(
          `length ${String(length)} exceeds the ring capacity of ${String(this.capacity)} samples`,
        );
      }
      return 'not-yet-written';
    }
    return this.readRange(this.end - length, length, out);
  }
}
