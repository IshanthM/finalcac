/**
 * RIFF/WAVE encode and decode.
 *
 * Encode: mono, either 16-bit PCM or 32-bit IEEE float.
 * Decode: PCM 8/16/24/32-bit integer and 32/64-bit float, plain or WAVE_FORMAT_EXTENSIBLE,
 * any channel count (mixed down to mono), unknown chunks skipped, odd-sized chunks followed by
 * their pad byte. A data chunk that claims more bytes than the file holds (streaming writers
 * leave the size unset) is read up to the last whole frame.
 *
 * Integer scaling is linear with full scale at 2^(bits-1): a sample v decodes to
 * v / 2^(bits-1) in [-1, 1), and encoding to PCM16 is round(x * 32768) clamped to
 * [-32768, 32767]. This matches libsndfile, Python soundfile and Web Audio decoding, and
 * decode(encode(x)) == x to within half an LSB for every x in [-1, 32767/32768].
 */

/** Sample formats `encodeWav` can write. */
export type WavEncodeFormat = 'pcm16' | 'float32';

/** Sample formats `decodeWav` can read. */
export type WavSampleFormat = 'pcm8' | 'pcm16' | 'pcm24' | 'pcm32' | 'float32' | 'float64';

export interface WavEncodeOptions {
  readonly format: WavEncodeFormat;
}

export interface DecodedWav {
  /** Frames per second (Hz). */
  readonly sampleRate: number;
  /** Channels in the file. `samples` is always mono. */
  readonly channels: number;
  /** Mono mixdown: each frame's channels averaged with equal weight. */
  readonly samples: Float32Array;
  /** Container sample format. */
  readonly format: WavSampleFormat;
  /** Bits carrying signal: wValidBitsPerSample for WAVE_FORMAT_EXTENSIBLE, else the container size. */
  readonly validBitsPerSample: number;
}

/** Thrown when bytes are not a WAV file this decoder supports. */
export class WavFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WavFormatError';
  }
}

const FORMAT_PCM = 0x0001;
const FORMAT_IEEE_FLOAT = 0x0003;
const FORMAT_EXTENSIBLE = 0xfffe;
/** Bytes 4..15 of every KSDATAFORMAT_SUBTYPE_* GUID (the first 4 bytes hold the format code). */
const SUBTYPE_GUID_TAIL = [
  0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71,
] as const;
const MAX_UINT32 = 0xffffffff;

function writeFourCC(view: DataView, offset: number, id: string): void {
  for (let i = 0; i < 4; i++) view.setUint8(offset + i, id.charCodeAt(i));
}

function readFourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/**
 * Encodes mono `samples` as a WAV file.
 *
 * - `pcm16`: canonical 44-byte header. Samples are clamped to [-1, 1] (so +-Infinity become
 *   full scale) and NaN is rejected.
 * - `float32`: WAVE_FORMAT_IEEE_FLOAT with an 18-byte fmt chunk and a fact chunk, as the format
 *   requires for non-PCM data. Samples are stored unchanged.
 *
 * @throws RangeError for a sample rate that is not an integer in [1, 2^32 - 1], a NaN sample in
 * PCM16 mode, or audio too long for a 32-bit RIFF size.
 */
export function encodeWav(
  samples: Float32Array,
  sampleRate: number,
  options: WavEncodeOptions,
): Uint8Array {
  if (!Number.isInteger(sampleRate) || sampleRate < 1 || sampleRate > MAX_UINT32) {
    throw new RangeError(`sampleRate must be an integer in [1, 2^32 - 1], got ${String(sampleRate)}`);
  }
  const isFloat = options.format === 'float32';
  const bytesPerSample = isFloat ? 4 : 2;
  const fmtSize = isFloat ? 18 : 16;
  const factBytes = isFloat ? 12 : 0;
  const dataSize = samples.length * bytesPerSample;
  const headerSize = 12 + 8 + fmtSize + factBytes + 8;
  if (headerSize - 8 + dataSize > MAX_UINT32) {
    throw new RangeError('audio is too long for a 32-bit RIFF size');
  }

  const bytes = new Uint8Array(headerSize + dataSize);
  const view = new DataView(bytes.buffer);
  let o = 0;
  writeFourCC(view, o, 'RIFF');
  view.setUint32(o + 4, headerSize - 8 + dataSize, true);
  writeFourCC(view, o + 8, 'WAVE');
  o += 12;

  writeFourCC(view, o, 'fmt ');
  view.setUint32(o + 4, fmtSize, true);
  view.setUint16(o + 8, isFloat ? FORMAT_IEEE_FLOAT : FORMAT_PCM, true);
  view.setUint16(o + 10, 1, true); // channels
  view.setUint32(o + 12, sampleRate, true);
  view.setUint32(o + 16, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(o + 20, bytesPerSample, true); // block align
  view.setUint16(o + 22, bytesPerSample * 8, true); // bits per sample
  if (isFloat) view.setUint16(o + 24, 0, true); // cbSize
  o += 8 + fmtSize;

  if (isFloat) {
    writeFourCC(view, o, 'fact');
    view.setUint32(o + 4, 4, true);
    view.setUint32(o + 8, samples.length, true); // sample frames
    o += 12;
  }

  writeFourCC(view, o, 'data');
  view.setUint32(o + 4, dataSize, true);
  o += 8;

  if (isFloat) {
    for (let i = 0; i < samples.length; i++, o += 4) view.setFloat32(o, samples[i]!, true);
  } else {
    for (let i = 0; i < samples.length; i++, o += 2) {
      const x = samples[i]!;
      if (Number.isNaN(x)) throw new RangeError(`sample ${String(i)} is NaN`);
      const scaled = Math.round((x > 1 ? 1 : x < -1 ? -1 : x) * 32768);
      view.setInt16(o, scaled > 32767 ? 32767 : scaled, true);
    }
  }
  return bytes;
}

interface FmtChunk {
  readonly formatCode: number;
  readonly channels: number;
  readonly sampleRate: number;
  readonly blockAlign: number;
  readonly bitsPerSample: number;
  readonly validBitsPerSample: number;
}

function parseFmt(view: DataView, offset: number, size: number): FmtChunk {
  if (size < 16) throw new WavFormatError(`fmt chunk is ${String(size)} bytes; need at least 16`);
  let formatCode = view.getUint16(offset, true);
  const channels = view.getUint16(offset + 2, true);
  const sampleRate = view.getUint32(offset + 4, true);
  const blockAlign = view.getUint16(offset + 12, true);
  const bitsPerSample = view.getUint16(offset + 14, true);
  let validBitsPerSample = bitsPerSample;

  if (formatCode === FORMAT_EXTENSIBLE) {
    if (size < 40) {
      throw new WavFormatError(`WAVE_FORMAT_EXTENSIBLE fmt chunk is ${String(size)} bytes; need 40`);
    }
    const cbSize = view.getUint16(offset + 16, true);
    if (cbSize < 22) {
      throw new WavFormatError(`WAVE_FORMAT_EXTENSIBLE cbSize is ${String(cbSize)}; need 22`);
    }
    const valid = view.getUint16(offset + 18, true);
    validBitsPerSample = valid === 0 ? bitsPerSample : valid;
    const subFormat = view.getUint32(offset + 24, true);
    for (let i = 0; i < SUBTYPE_GUID_TAIL.length; i++) {
      if (view.getUint8(offset + 28 + i) !== SUBTYPE_GUID_TAIL[i]) {
        throw new WavFormatError('WAVE_FORMAT_EXTENSIBLE sub-format GUID is not a standard subtype');
      }
    }
    formatCode = subFormat;
  }

  if (channels < 1) throw new WavFormatError('fmt chunk declares zero channels');
  if (sampleRate < 1) throw new WavFormatError('fmt chunk declares a zero sample rate');
  if (validBitsPerSample > bitsPerSample) {
    throw new WavFormatError(
      `valid bits (${String(validBitsPerSample)}) exceed the container (${String(bitsPerSample)})`,
    );
  }
  return { formatCode, channels, sampleRate, blockAlign, bitsPerSample, validBitsPerSample };
}

function sampleFormatOf(fmt: FmtChunk): WavSampleFormat {
  if (fmt.formatCode === FORMAT_PCM) {
    switch (fmt.bitsPerSample) {
      case 8:
        return 'pcm8';
      case 16:
        return 'pcm16';
      case 24:
        return 'pcm24';
      case 32:
        return 'pcm32';
      default:
        throw new WavFormatError(`unsupported PCM bit depth ${String(fmt.bitsPerSample)}`);
    }
  }
  if (fmt.formatCode === FORMAT_IEEE_FLOAT) {
    if (fmt.bitsPerSample === 32) return 'float32';
    if (fmt.bitsPerSample === 64) return 'float64';
    throw new WavFormatError(`unsupported float bit depth ${String(fmt.bitsPerSample)}`);
  }
  throw new WavFormatError(
    `unsupported WAV format code 0x${fmt.formatCode.toString(16).padStart(4, '0')}`,
  );
}

function readSample(view: DataView, offset: number, format: WavSampleFormat): number {
  switch (format) {
    case 'pcm8':
      return (view.getUint8(offset) - 128) / 128;
    case 'pcm16':
      return view.getInt16(offset, true) / 32768;
    case 'pcm24': {
      const unsigned =
        view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
      return (unsigned & 0x800000 ? unsigned - 0x1000000 : unsigned) / 8388608;
    }
    case 'pcm32':
      return view.getInt32(offset, true) / 2147483648;
    case 'float32':
      return view.getFloat32(offset, true);
    case 'float64':
      return view.getFloat64(offset, true);
  }
}

/**
 * Decodes a WAV file to a mono Float32Array.
 *
 * @throws WavFormatError when the bytes are not RIFF/WAVE, the fmt or data chunk is missing,
 * or the encoding is unsupported (compressed formats, RF64, big-endian RIFX, odd bit depths).
 */
export function decodeWav(bytes: Uint8Array): DecodedWav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12) throw new WavFormatError('file is too short to be a WAV file');
  const riff = readFourCC(view, 0);
  if (riff !== 'RIFF') {
    throw new WavFormatError(
      riff === 'RF64' || riff === 'RIFX'
        ? `${riff} files are not supported`
        : 'missing RIFF header',
    );
  }
  if (readFourCC(view, 8) !== 'WAVE') throw new WavFormatError('RIFF file is not WAVE');

  let fmt: FmtChunk | undefined;
  let dataOffset = -1;
  let dataSize = 0;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = readFourCC(view, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    const available = Math.min(size, bytes.byteLength - body);
    if (id === 'fmt ' && fmt === undefined) {
      if (available < size) throw new WavFormatError('fmt chunk is truncated');
      fmt = parseFmt(view, body, size);
    } else if (id === 'data' && dataOffset < 0) {
      dataOffset = body;
      dataSize = available;
    }
    offset = body + size + (size & 1); // chunks are padded to an even length
  }

  if (fmt === undefined) throw new WavFormatError('missing fmt chunk');
  if (dataOffset < 0) throw new WavFormatError('missing data chunk');
  const format = sampleFormatOf(fmt);
  const bytesPerSample = fmt.bitsPerSample / 8;
  const channels = fmt.channels;
  if (fmt.blockAlign !== channels * bytesPerSample) {
    throw new WavFormatError(
      `block align ${String(fmt.blockAlign)} does not match ${String(channels)} channel(s) of ${String(fmt.bitsPerSample)}-bit samples`,
    );
  }

  const frames = Math.floor(dataSize / fmt.blockAlign);
  const samples = new Float32Array(frames);
  const scale = 1 / channels;
  for (let f = 0; f < frames; f++) {
    const frameOffset = dataOffset + f * fmt.blockAlign;
    if (channels === 1) {
      samples[f] = readSample(view, frameOffset, format);
    } else {
      let sum = 0;
      for (let c = 0; c < channels; c++) {
        sum += readSample(view, frameOffset + c * bytesPerSample, format);
      }
      samples[f] = sum * scale;
    }
  }

  return {
    sampleRate: fmt.sampleRate,
    channels,
    samples,
    format,
    validBitsPerSample: fmt.validBitsPerSample,
  };
}
