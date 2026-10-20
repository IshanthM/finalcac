import { describe, expect, it } from 'vitest';
import { RING_BUFFER_S, secondsToSamples } from '../src/dsp/constants.ts';
import { RingBuffer } from '../src/dsp/ringBuffer.ts';

/** Samples whose values equal their absolute index, so every read is easy to verify. */
function ramp(from: number, length: number): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = from + i;
  return out;
}

/** An 8-sample ring: 1 ms at 8 kHz. */
function smallRing(startIndex = 0): RingBuffer {
  return new RingBuffer(8000, { seconds: 0.001, startIndex });
}

describe('RingBuffer capacity', () => {
  it('holds secondsToSamples(RING_BUFFER_S, sr) samples by default', () => {
    expect(new RingBuffer(48000).capacity).toBe(secondsToSamples(RING_BUFFER_S, 48000));
    expect(new RingBuffer(48000).capacity).toBe(48000 * RING_BUFFER_S);
    expect(new RingBuffer(44100).capacity).toBe(44100 * RING_BUFFER_S);
    expect(smallRing().capacity).toBe(8);
  });

  it('rejects a zero capacity and a bad start index', () => {
    expect(() => new RingBuffer(8000, { seconds: 0 })).toThrow(RangeError);
    expect(() => new RingBuffer(8000, { startIndex: -1 })).toThrow(RangeError);
    expect(() => new RingBuffer(8000, { startIndex: 1.5 })).toThrow(RangeError);
    expect(() => new RingBuffer(8000, { startIndex: 2 ** 53 })).toThrow(RangeError);
  });
});

describe('RingBuffer reads and writes', () => {
  it('starts empty and tracks absolute indices', () => {
    const ring = smallRing();
    expect([ring.writeIndex, ring.oldestIndex, ring.size, ring.totalWritten]).toEqual([0, 0, 0, 0]);
    ring.write(ramp(0, 5));
    expect([ring.writeIndex, ring.oldestIndex, ring.size, ring.totalWritten]).toEqual([5, 0, 5, 5]);
    ring.write(new Float32Array(0));
    expect(ring.writeIndex).toBe(5);
  });

  it('wraps around and returns samples in order across the seam', () => {
    const ring = smallRing();
    ring.write(ramp(0, 5));
    ring.write(ramp(5, 5)); // 10 written, capacity 8: samples 2..9 remain
    expect(ring.oldestIndex).toBe(2);
    const out = new Float32Array(8);
    expect(ring.readRange(2, 8, out)).toBe('ok');
    expect(Array.from(out)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    const part = new Float32Array(3);
    expect(ring.readRange(6, 3, part)).toBe('ok'); // crosses the physical end of the array
    expect(Array.from(part)).toEqual([6, 7, 8]);
  });

  it('honours the exact boundaries of the held range', () => {
    const ring = smallRing();
    ring.write(ramp(0, 13)); // holds 5..12
    const out = new Float32Array(8);
    expect(ring.readRange(5, 8, out)).toBe('ok'); // oldest through newest
    expect(Array.from(out)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
    expect(ring.readRange(4, 1, out)).toBe('overwritten'); // one before the oldest
    expect(ring.readRange(4, 3, out)).toBe('overwritten'); // straddles the old edge
    expect(ring.readRange(12, 1, out)).toBe('ok'); // the newest sample
    expect(ring.readRange(13, 1, out)).toBe('not-yet-written'); // one past the newest
    expect(ring.readRange(11, 3, out)).toBe('not-yet-written'); // straddles the new edge
    expect(ring.readRange(13, 0, out)).toBe('ok'); // empty range at the write head
  });

  it('detects when a range it once held has been overwritten', () => {
    const ring = smallRing();
    ring.write(ramp(0, 6));
    const out = new Float32Array(4);
    expect(ring.readRange(1, 4, out)).toBe('ok');
    ring.write(ramp(6, 3)); // 9 written: 0 dropped, 1..8 held
    expect(ring.readRange(1, 4, out)).toBe('ok');
    ring.write(ramp(9, 1)); // 10 written: 2..9 held
    expect(ring.readRange(1, 4, out)).toBe('overwritten');
    expect(ring.readRange(2, 4, out)).toBe('ok');
    expect(Array.from(out)).toEqual([2, 3, 4, 5]);
  });

  it('keeps only the newest samples of a chunk longer than the capacity', () => {
    const ring = smallRing();
    ring.write(ramp(0, 3));
    ring.write(ramp(3, 20)); // writes 3..22; only 15..22 survive
    expect(ring.writeIndex).toBe(23);
    expect(ring.oldestIndex).toBe(15);
    const out = new Float32Array(8);
    expect(ring.readRange(15, 8, out)).toBe('ok');
    expect(Array.from(out)).toEqual([15, 16, 17, 18, 19, 20, 21, 22]);
  });

  it('leaves the output untouched when a read fails', () => {
    const ring = smallRing();
    ring.write(ramp(0, 20));
    const out = new Float32Array(4).fill(-1);
    expect(ring.readRange(0, 4, out)).toBe('overwritten');
    expect(ring.readRange(18, 4, out)).toBe('not-yet-written');
    expect(Array.from(out)).toEqual([-1, -1, -1, -1]);
  });

  it('reads the latest samples once enough exist', () => {
    const ring = smallRing();
    const out = new Float32Array(8);
    ring.write(ramp(0, 3));
    expect(ring.readLatest(4, out)).toBe('not-yet-written');
    expect(ring.readLatest(3, out)).toBe('ok');
    expect(Array.from(out.subarray(0, 3))).toEqual([0, 1, 2]);
    ring.write(ramp(3, 30));
    expect(ring.readLatest(8, out)).toBe('ok');
    expect(Array.from(out)).toEqual([25, 26, 27, 28, 29, 30, 31, 32]);
    expect(ring.readLatest(0, out)).toBe('ok');
    expect(() => ring.readLatest(9, out)).toThrow(RangeError);
  });

  it('rejects malformed reads', () => {
    const ring = smallRing();
    ring.write(ramp(0, 8));
    const out = new Float32Array(8);
    expect(() => ring.readRange(-1, 1, out)).toThrow(RangeError);
    expect(() => ring.readRange(0.5, 1, out)).toThrow(RangeError);
    expect(() => ring.readRange(0, -1, out)).toThrow(RangeError);
    expect(() => ring.readRange(0, 9, new Float32Array(9))).toThrow(RangeError); // > capacity
    expect(() => ring.readRange(0, 4, new Float32Array(3))).toThrow(RangeError); // out too short
    expect(() => ring.readLatest(1.5, out)).toThrow(RangeError);
  });
});

describe('RingBuffer absolute indices near 2^53', () => {
  it('stays exact up to Number.MAX_SAFE_INTEGER and refuses to pass it', () => {
    const start = Number.MAX_SAFE_INTEGER - 20;
    const ring = smallRing(start);
    expect(ring.oldestIndex).toBe(start);
    const out = new Float32Array(8);
    expect(ring.readRange(start - 1, 1, out)).toBe('overwritten');

    // Values cannot hold such large indices in float32, so write a local ramp instead.
    ring.write(ramp(0, 12)); // absolute start .. start + 11; ring holds the last 8
    expect(ring.writeIndex).toBe(start + 12);
    expect(ring.oldestIndex).toBe(start + 4);
    expect(ring.readRange(start + 4, 8, out)).toBe('ok');
    expect(Array.from(out)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
    expect(ring.readRange(start + 3, 1, out)).toBe('overwritten');
    expect(ring.readRange(start + 12, 1, out)).toBe('not-yet-written');

    ring.write(ramp(12, 8)); // writeIndex reaches exactly MAX_SAFE_INTEGER
    expect(ring.writeIndex).toBe(Number.MAX_SAFE_INTEGER);
    expect(ring.readLatest(8, out)).toBe('ok');
    expect(Array.from(out)).toEqual([12, 13, 14, 15, 16, 17, 18, 19]);
    expect(() => {
      ring.write(ramp(0, 1));
    }).toThrow(RangeError);
  });
});

describe('RingBuffer at audio scale', () => {
  it('serves STFT frames from 128-sample worklet chunks and drops audio older than the buffer', () => {
    const sampleRate = 48000;
    const ring = new RingBuffer(sampleRate);
    const cap = ring.capacity;
    const chunk = new Float32Array(128);
    let written = 0;
    while (written < 5 * sampleRate) {
      for (let i = 0; i < chunk.length; i++) chunk[i] = Math.fround(Math.sin((written + i) * 1e-3));
      ring.write(chunk);
      written += chunk.length;
    }
    expect(ring.writeIndex).toBe(written);
    const frame = new Float32Array(2048);
    const start = written - 2048;
    expect(ring.readRange(start, 2048, frame)).toBe('ok');
    for (let i = 0; i < 2048; i += 97) {
      expect(frame[i]).toBe(Math.fround(Math.sin((start + i) * 1e-3)));
    }
    expect(ring.readRange(written - cap, 2048, frame)).toBe('ok');
    expect(ring.readRange(written - cap - 1, 2048, frame)).toBe('overwritten');
  });
});
