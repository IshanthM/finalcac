// Usage: npm run analyze -- recordings/*.wav [--json] [--profile 13300[,spread]] [--calibrating]
// For every onset in each WAV, prints the measurements Checkpoint 1 needs (ring frequency, SNR, guard margin,
// click length, ring length, decay) and what the detector would decide, with the reason for any rejection.
import { readFileSync } from 'node:fs';
import { decodeWav } from '../src/dsp/wav.ts';
import { scanSignal } from '../src/dsp/pipeline.ts';
import type { TagProfile } from '../src/dsp/profile.ts';

const args = process.argv.slice(2);
const json = args.includes('--json');
const calibrating = args.includes('--calibrating');
const pi = args.indexOf('--profile');
const files = args.filter((a, i) => !a.startsWith('--') && (pi < 0 || i !== pi + 1));
if (files.length === 0) {
  console.error('usage: npm run analyze -- file.wav [more.wav] [--json] [--profile FREQ[,SPREAD]] [--calibrating]');
  process.exit(1);
}
const [pf, ps] = pi >= 0 ? (args[pi + 1] ?? '').split(',').map(Number) : [];
const f = (v: number, d = 1): string => (Number.isFinite(v) ? v.toFixed(d) : String(v));
const rows: Record<string, unknown>[] = [];

for (const file of files) {
  const wav = decodeWav(new Uint8Array(readFileSync(file)));
  const sr = wav.sampleRate;
  const profile: TagProfile | null = pf
    ? { freqHz: pf, spreadFrac: ps ?? 0.002, decayMs: 0, sampleRate: sr, calibratedAt: '', rings: [] }
    : null;
  const evals = scanSignal(wav.samples, sr, profile, { skipTolerance: calibrating || profile === null });
  if (!json) console.log(`\n${file}: ${(wav.samples.length / sr).toFixed(2)} s @ ${sr} Hz, ${evals.length} onset(s)`);
  let n = 0;
  for (const ev of evals) {
    const a = ev.analysis;
    const row = {
      file, n: ++n, atS: +(ev.onset.frameStart / sr).toFixed(3), peakHz: a.peak ? +a.peak.freqHz.toFixed(1) : null,
      snrDb: +f(a.snrDb), guardDb: a.peak ? +f(a.peak.guardMarginDb) : null,
      clickMs: +f(a.clickMs), ringMs: +f(a.ringMs), windowMs: +f(a.windowMs), tauMs: +f(a.tauMs), decay20Ms: +f(a.decay20Ms), r2: +f(a.decayR2, 2),
      accepted: ev.verdict.accepted, failed: ev.verdict.failed,
    };
    rows.push(row);
    if (!json) {
      console.log(
        `  #${row.n} t=${row.atS}s  peak ${row.peakHz} Hz  SNR ${row.snrDb} dB  guard ${row.guardDb} dB  ` +
          `click ${row.clickMs} ms  ring ${row.ringMs} ms (window ${row.windowMs})  tau ${row.tauMs} ms  -20dB ${row.decay20Ms} ms  R2 ${row.r2}  ` +
          (row.accepted ? 'ACCEPTED' : `rejected: ${ev.verdict.failed.map((g) => ev.verdict.gates[g].text).join(' | ')}`),
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
