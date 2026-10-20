import { describe, expect, it } from 'vitest';
import { WavFormatError, decodeWav, encodeWav } from '../src/dsp/wav.ts';
import { createRandom } from '../src/dsp/random.ts';

/** Little-endian byte builder for hand-made WAV files. */
class Bytes {
  private readonly parts: number[] = [];

  ascii(text: string): this {
    for (const char of text) this.parts.push(char.charCodeAt(0));
    return this;
  }

  u8(...values: number[]): this {
    for (const value of values) this.parts.push(value & 0xff);
    return this;
  }

  u16(value: number): this {
    return this.u8(value, value >>> 8);
  }

  u32(value: number): this {
    return this.u8(value, value >>> 8, value >>> 16, value >>> 24);
  }

  i16(value: number): this {
    return this.u16(value & 0xffff);
  }

  i24(value: number): this {
    const v = value & 0xffffff;
    return this.u8(v, v >>> 8, v >>> 16);
  }

  i32(value: number): this {
    return this.u32(value >>> 0);
  }

  f32(value: number): this {
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, value, true);
    return this.u8(...new Uint8Array(view.buffer));
  }

  f64(value: number): this {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value, true);
    return this.u8(...new Uint8Array(view.buffer));
  }

  bytes(other: Bytes): this {
    this.parts.push(...other.parts);
    return this;
  }

  get length(): number {
    return this.parts.length;
  }

  build(): Uint8Array {
    return Uint8Array.from(this.parts);
  }
}

interface Chunk {
  readonly id: string;
  readonly body: Bytes;
  /** Override the declared size (for truncated or streaming files). */
  readonly declaredSize?: number;
  /** Skip the pad byte after an odd-sized body (malformed files). */
  readonly noPad?: boolean;
}

/** Assembles RIFF/WAVE from chunks, adding pad bytes after odd-sized bodies. */
function riff(chunks: Chunk[]): Uint8Array {
  const inner = new Bytes().ascii('WAVE');
  for (const chunk of chunks) {
    inner.ascii(chunk.id).u32(chunk.declaredSize ?? chunk.body.length).bytes(chunk.body);
    if (chunk.body.length % 2 === 1 && chunk.noPad !== true) inner.u8(0);
  }
  return new Bytes().ascii('RIFF').u32(inner.length).bytes(inner).build();
}

function fmt(format: number, channels: number, sampleRate: number, bits: number): Chunk {
  const blockAlign = (channels * bits) / 8;
  return {
    id: 'fmt ',
    body: new Bytes()
      .u16(format)
      .u16(channels)
      .u32(sampleRate)
      .u32(sampleRate * blockAlign)
      .u16(blockAlign)
      .u16(bits),
  };
}

/** WAVE_FORMAT_EXTENSIBLE fmt chunk with a standard sub-format GUID. */
function fmtExtensible(
  subFormat: number,
  channels: number,
  sampleRate: number,
  bits: number,
  validBits: number,
): Chunk {
  const base = fmt(0xfffe, channels, sampleRate, bits).body;
  const body = new Bytes()
    .bytes(base)
    .u16(22) // cbSize
    .u16(validBits)
    .u32(channels === 1 ? 0x4 : 0x3) // channel mask
    .u32(subFormat)
    .u8(0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71);
  return { id: 'fmt ', body };
}

function data(body: Bytes, declaredSize?: number): Chunk {
  return declaredSize === undefined ? { id: 'data', body } : { id: 'data', body, declaredSize };
}

function expectSamples(actual: Float32Array, expected: number[], digits = 7): void {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, i) => {
    expect(actual[i]).toBeCloseTo(value, digits);
  });
}

describe('encodeWav', () => {
  it('writes a canonical 44-byte PCM16 header', () => {
    const bytes = encodeWav(new Float32Array(10), 48000, { format: 'pcm16' });
    const view = new DataView(bytes.buffer);
    const text = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
    expect(bytes.length).toBe(44 + 20);
    expect(text(0)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + 20);
    expect(text(8)).toBe('WAVE');
    expect(text(12)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint32(28, true)).toBe(96000); // byte rate
    expect(view.getUint16(32, true)).toBe(2); // block align
    expect(view.getUint16(34, true)).toBe(16);
    expect(text(36)).toBe('data');
    expect(view.getUint32(40, true)).toBe(20);
  });

  it('writes float32 as WAVE_FORMAT_IEEE_FLOAT with an 18-byte fmt and a fact chunk', () => {
    const bytes = encodeWav(new Float32Array([0.25, -0.5, 1.5]), 44100, { format: 'float32' });
    const view = new DataView(bytes.buffer);
    const text = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
    expect(view.getUint32(16, true)).toBe(18);
    expect(view.getUint16(20, true)).toBe(3);
    expect(view.getUint16(34, true)).toBe(32);
    expect(view.getUint16(36, true)).toBe(0); // cbSize
    expect(text(38)).toBe('fact');
    expect(view.getUint32(46, true)).toBe(3);
    expect(text(50)).toBe('data');
    expect(view.getUint32(54, true)).toBe(12);
    expect(bytes.length).toBe(58 + 12);
    expect(view.getUint32(4, true)).toBe(bytes.length - 8);
  });

  it('round-trips PCM16 to within half an LSB', () => {
    const random = createRandom(1);
    const samples = new Float32Array(5000);
    for (let i = 0; i < samples.length; i++) samples[i] = (2 * random() - 1) * 0.999;
    const decoded = decodeWav(encodeWav(samples, 44100, { format: 'pcm16' }));
    expect(decoded.sampleRate).toBe(44100);
    expect(decoded.channels).toBe(1);
    expect(decoded.format).toBe('pcm16');
    expect(decoded.validBitsPerSample).toBe(16);
    let worst = 0;
    for (let i = 0; i < samples.length; i++) {
      worst = Math.max(worst, Math.abs(decoded.samples[i]! - samples[i]!));
    }
    expect(worst).toBeLessThanOrEqual(0.5 / 32768 + 1e-9);
  });

  it('round-trips exact PCM16 levels bit-for-bit and clamps out-of-range input', () => {
    const exact = Float32Array.from([0, 1, -1, 12345, -32768, 32767], (v) => v / 32768);
    expect(Array.from(decodeWav(encodeWav(exact, 8000, { format: 'pcm16' })).samples)).toEqual(
      Array.from(exact),
    );
    const loud = Float32Array.from([1, 1.5, -1.5, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]);
    const decoded = decodeWav(encodeWav(loud, 8000, { format: 'pcm16' })).samples;
    expect(Array.from(decoded)).toEqual([32767, 32767, -32768, 32767, -32768].map((v) => v / 32768));
  });

  it('round-trips float32 exactly', () => {
    const samples = Float32Array.from([0, 0.1, -0.7, 1.25, -3, 1e-20]);
    const decoded = decodeWav(encodeWav(samples, 96000, { format: 'float32' }));
    expect(decoded.format).toBe('float32');
    expect(decoded.sampleRate).toBe(96000);
    expect(Array.from(decoded.samples)).toEqual(Array.from(samples));
  });

  it('handles empty audio', () => {
    const decoded = decodeWav(encodeWav(new Float32Array(0), 48000, { format: 'pcm16' }));
    expect(decoded.samples.length).toBe(0);
  });

  it('rejects NaN samples in PCM16 and invalid sample rates', () => {
    expect(() => encodeWav(Float32Array.from([0, Number.NaN]), 48000, { format: 'pcm16' })).toThrow(
      RangeError,
    );
    for (const bad of [0, -1, 44100.5, 2 ** 32]) {
      expect(() => encodeWav(new Float32Array(1), bad, { format: 'pcm16' })).toThrow(RangeError);
    }
  });
});

describe('decodeWav on hand-built files', () => {
  it('decodes 24-bit stereo, skipping odd-sized unknown chunks and their pad bytes', () => {
    const file = riff([
      { id: 'LIST', body: new Bytes().ascii('INFOx') }, // 5 bytes + pad
      fmt(1, 2, 48000, 24),
      { id: 'junk', body: new Bytes().u8(1, 2, 3) }, // 3 bytes + pad
      data(
        new Bytes()
          .i24(0x7fffff)
          .i24(0x7fffff) // frame 0: both channels at +full scale
          .i24(-0x800000)
          .i24(0) // frame 1: -1 and 0
          .i24(1)
          .i24(-1), // frame 2: +1 LSB and -1 LSB
      ),
    ]);
    const decoded = decodeWav(file);
    expect(decoded.format).toBe('pcm24');
    expect(decoded.channels).toBe(2);
    expect(decoded.sampleRate).toBe(48000);
    expectSamples(decoded.samples, [8388607 / 8388608, -0.5, 0], 9);
  });

  it('mixes stereo down to the per-frame channel mean', () => {
    const body = new Bytes();
    const left = [0.5, 0.25, -1, 0.75];
    const right = [-0.25, 0.25, 0.5, 0];
    for (let i = 0; i < left.length; i++) body.i16(left[i]! * 32768).i16(right[i]! * 32768);
    const decoded = decodeWav(riff([fmt(1, 2, 44100, 16), data(body)]));
    expectSamples(decoded.samples, [0.125, 0.25, -0.25, 0.375], 9);
  });

  it('cancels anti-phase stereo to silence', () => {
    const left = new Float32Array(64);
    for (let i = 0; i < left.length; i++) left[i] = 0.5 * Math.sin(i / 3);
    const body = new Bytes();
    for (const value of left) body.f32(value).f32(-value);
    const decoded = decodeWav(riff([fmt(3, 2, 48000, 32), data(body)]));
    expect(decoded.samples.every((value) => value === 0)).toBe(true);
  });

  it('decodes WAVE_FORMAT_EXTENSIBLE float32 and PCM with fewer valid bits than the container', () => {
    const float = decodeWav(
      riff([fmtExtensible(3, 1, 48000, 32, 32), data(new Bytes().f32(0.5).f32(-0.25))]),
    );
    expect(float.format).toBe('float32');
    expectSamples(float.samples, [0.5, -0.25], 9);

    const pcm = decodeWav(
      riff([fmtExtensible(1, 1, 44100, 16, 12), data(new Bytes().i16(-32768).i16(16384))]),
    );
    expect(pcm.format).toBe('pcm16');
    expect(pcm.validBitsPerSample).toBe(12);
    expectSamples(pcm.samples, [-1, 0.5], 9);

    // 24 valid bits left-justified in a 32-bit container decode as 32-bit integers.
    const packed = decodeWav(
      riff([fmtExtensible(1, 1, 96000, 32, 24), data(new Bytes().i32(0x40000000).i32(-0x80000000))]),
    );
    expect(packed.format).toBe('pcm32');
    expect(packed.validBitsPerSample).toBe(24);
    expectSamples(packed.samples, [0.5, -1], 9);
  });

  it('decodes 8-bit unsigned, 32-bit integer and 64-bit float PCM', () => {
    const u8 = decodeWav(riff([fmt(1, 1, 8000, 8), data(new Bytes().u8(0, 128, 255))]));
    expect(u8.format).toBe('pcm8');
    expectSamples(u8.samples, [-1, 0, 127 / 128], 9);

    const i32 = decodeWav(
      riff([fmt(1, 1, 8000, 32), data(new Bytes().i32(2147483647).i32(-2147483648).i32(0))]),
    );
    expect(i32.format).toBe('pcm32');
    expectSamples(i32.samples, [1, -1, 0], 7);

    const f64 = decodeWav(riff([fmt(3, 1, 8000, 64), data(new Bytes().f64(0.123456789).f64(-2))]));
    expect(f64.format).toBe('float64');
    expectSamples(f64.samples, [0.123456789, -2], 7);
  });

  it('respects the pad byte after an odd-sized data chunk followed by more chunks', () => {
    const file = riff([
      fmt(1, 1, 8000, 8),
      data(new Bytes().u8(0, 64, 192)), // 3 bytes + pad
      { id: 'LIST', body: new Bytes().ascii('INFO') },
    ]);
    expectSamples(decodeWav(file).samples, [-1, -0.5, 0.5], 9);
  });

  it('reads a data chunk whose declared size runs past the end of the file', () => {
    const body = new Bytes().i16(1000).i16(2000).i16(3000).u8(7); // 3.5 frames present
    const truncated = decodeWav(
      riff([fmt(1, 1, 8000, 16), { id: 'data', body, declaredSize: 1000, noPad: true }]),
    );
    expectSamples(truncated.samples, [1000, 2000, 3000].map((v) => v / 32768), 9);
    const streaming = decodeWav(riff([fmt(1, 1, 8000, 16), data(new Bytes().i16(-5), 0xffffffff)]));
    expectSamples(streaming.samples, [-5 / 32768], 9);
  });

  it('decodes from a Uint8Array view with a non-zero byte offset', () => {
    const file = encodeWav(Float32Array.from([0.5, -0.5]), 8000, { format: 'pcm16' });
    const padded = new Uint8Array(file.length + 3);
    padded.set(file, 3);
    expectSamples(decodeWav(padded.subarray(3)).samples, [0.5, -0.5], 9);
  });
});

describe('decodeWav rejects what it cannot read', () => {
  const pcm16 = fmt(1, 1, 8000, 16);
  const oneSample = data(new Bytes().i16(1));
  const cases: [string, Uint8Array][] = [
    ['a file shorter than a RIFF header', new Uint8Array(8)],
    ['a non-RIFF file', new Bytes().ascii('OggS').u32(0).ascii('WAVE').build()],
    ['RF64', new Bytes().ascii('RF64').u32(0).ascii('WAVE').build()],
    ['big-endian RIFX', new Bytes().ascii('RIFX').u32(0).ascii('WAVE').build()],
    ['a RIFF file that is not WAVE', new Bytes().ascii('RIFF').u32(4).ascii('AVI ').build()],
    ['a missing fmt chunk', riff([oneSample])],
    ['a missing data chunk', riff([pcm16])],
    ['a compressed format (ADPCM)', riff([fmt(2, 1, 8000, 4), oneSample])],
    ['an unsupported PCM depth', riff([fmt(1, 1, 8000, 12), oneSample])],
    ['an unsupported float depth', riff([fmt(3, 1, 8000, 16), oneSample])],
    ['zero channels', riff([fmt(1, 0, 8000, 16), oneSample])],
    ['a zero sample rate', riff([fmt(1, 1, 0, 16), oneSample])],
    ['a fmt chunk that is too short', riff([{ id: 'fmt ', body: new Bytes().u16(1) }, oneSample])],
    [
      'an inconsistent block align',
      riff([
        {
          id: 'fmt ',
          body: new Bytes().u16(1).u16(1).u32(8000).u32(16000).u16(4).u16(16),
        },
        oneSample,
      ]),
    ],
    [
      'an extensible fmt with a non-standard GUID',
      (() => {
        const chunk = fmtExtensible(1, 1, 8000, 16, 16);
        const body = new Bytes().bytes(chunk.body);
        const bytes = riff([{ id: 'fmt ', body }, oneSample]);
        bytes[12 + 8 + 39] = 0x00; // last GUID byte
        return bytes;
      })(),
    ],
    [
      'an extensible fmt with more valid bits than the container',
      riff([fmtExtensible(1, 1, 8000, 16, 20), oneSample]),
    ],
    ['a truncated fmt chunk', new Bytes().ascii('RIFF').u32(20).ascii('WAVEfmt ').u32(16).u16(1).build()],
  ];

  it.each(cases)('rejects %s', (_label, bytes) => {
    expect(() => decodeWav(bytes)).toThrow(WavFormatError);
  });
});
