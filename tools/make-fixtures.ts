// Generates synthetic recordings for browser e2e. Usage: make-fixtures.ts <name> [out.wav]
//   single         one ring at 3 s (13287 Hz)
//   calib          five rings 1.5 s apart: 13300, 13310, 13295, 13305, 13290 Hz
//   calib-outlier  same, but ring 3 is 13402 Hz (0.76% high)
import { writeFileSync } from 'node:fs';
import { encodeWav } from '../src/dsp/wav.ts';
import { addClick, addTone, gaussianNoise } from '../test/helpers/synth.ts';

const SR = 48000;
const name = process.argv[2] ?? 'single';
const out = process.argv[3] ?? `.scratch/${name}.wav`;

function ringsAt(seconds: number, rings: { atMs: number; f: number }[]): Float32Array {
  const x = gaussianNoise(Math.round(seconds * SR), 0.0005, 11);
  rings.forEach((r, i) => {
    addClick(x, SR, r.atMs, 0.3, 2, 100 + i);
    addTone(x, SR, r.atMs + 1, r.f, 0.05, 8);
  });
  return x;
}

const scenarios: Record<string, Float32Array> = {
  single: ringsAt(6, [{ atMs: 3000, f: 13287 }]),
  calib: ringsAt(9, [13300, 13310, 13295, 13305, 13290].map((f, i) => ({ atMs: 1000 + i * 1500, f }))),
  'calib-outlier': ringsAt(9, [13300, 13302, 13402, 13299, 13301].map((f, i) => ({ atMs: 1000 + i * 1500, f }))),
};
const x = scenarios[name];
if (!x) throw new Error(`unknown scenario ${name}`);
writeFileSync(out, encodeWav(x, SR, { format: 'pcm16' }));
console.log(`wrote ${out}`);
