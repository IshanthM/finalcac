import { encodeWav } from '../dsp/wav.ts';

/** Share (iOS share sheet → AirDrop/Files) when possible, else trigger a download. */
export async function saveWav(samples: Float32Array, sampleRate: number, name: string): Promise<void> {
  const bytes = encodeWav(samples, sampleRate, { format: 'float32' });
  const file = new File([bytes as BlobPart], name, { type: 'audio/wav' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
