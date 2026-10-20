// Usage: npm run analyze -- recordings/*.wav [--json]
// For every onset in each WAV, prints the measurements Checkpoint 1 needs:
// ring frequency, SNR, guard margin, click length, ring length, decay.
import { readFileSync } from 'node:fs';
import { decodeWav } from '../src/dsp/wav.ts';
import { OnsetDetector } from '../src/dsp/onset.ts';
import { analyzeEvent } from '../src/dsp/eventAnalysis.ts';

const args = process.argv.slice(2);
const json = args.includes('--json');
const files = args.filter((a) => !a.startsWith('--'));
if (files.length === 0) {
  console.error('usage: npm run analyze -- file.wav [more.wav] [--json]');
  process.exit(1);
}
const f = (v: number, d = 1): string => (Number.isFinite(v) ? v.toFixed(d) : String(v));
const rows: Record<string, unknown>[] = [];

for (const file of files) {
  const wav = decodeWav(new Uint8Array(readFileSync(file)));
  const sr = wav.sampleRate;
  const x = wav.samples;
  const det = new OnsetDetector(sr);
  const onsets = [];
  for (let i = 0; i < x.length; i += 128) onsets.push(...det.process(x.subarray(i, i + 128)));
  if (!json) console.log(`\n${file}: ${(x.length / sr).toFixed(2)} s @ ${sr} Hz, ${onsets.length} onset(s)`);
  let n = 0;
  for (const o of onsets) {
    const start = Math.max(0, o.frameStart - Math.round(0.3 * sr));
    const end = Math.min(x.length, o.frameStart + Math.round(0.5 * sr));
    const a = analyzeEvent(x.subarray(start, end), sr, o.frameStart - start);
    const row = {
      file, n: ++n, atS: +(o.frameStart / sr).toFixed(3), peakHz: a.peak ? +a.peak.freqHz.toFixed(1) : null,
      snrDb: +f(a.snrDb), guardDb: a.peak ? +f(a.peak.guardMarginDb) : null,
      clickMs: +f(a.clickMs), ringMs: +f(a.ringMs), tauMs: +f(a.tauMs), decay20Ms: +f(a.decay20Ms), r2: +f(a.decayR2, 2),
    };
    rows.push(row);
    if (!json) {
      console.log(
        `  #${row.n} t=${row.atS}s  peak ${row.peakHz} Hz  SNR ${row.snrDb} dB  guard ${row.guardDb} dB  ` +
          `click ${row.clickMs} ms  ring ${row.ringMs} ms  tau ${row.tauMs} ms  -20dB ${row.decay20Ms} ms  R2 ${row.r2}`,
      );
    }
  }
}
if (json) console.log(JSON.stringify(rows, null, 2));
else if (rows.length > 1) {
  const hz = rows.map((r) => r.peakHz as number).filter((v) => v != null).sort((a, b) => a - b);
  const med = hz[Math.floor(hz.length / 2)]!;
  console.log(`\nsummary: ${hz.length} peaks, median ${med} Hz, spread ${(((hz[hz.length - 1]! - hz[0]!) / med) * 100).toFixed(2)} %`);
}
