import { useEffect, useRef } from 'preact/hooks';
import { engine } from '../audio/engine.ts';
import { RealFftPlan } from '../dsp/fft.ts';
import { hannWindow } from '../dsp/window.ts';
import { PARAMS } from '../dsp/params.ts';

const FFT = 1024;
const COLS = 360;
const LO = 8000;
const HI = 16000;
const DB_MIN = -95;
const DB_MAX = -30;

/** Heat colour: black → deep yellow → white. */
function colour(t: number): [number, number, number] {
  const v = Math.max(0, Math.min(1, t));
  if (v < 0.6) { const k = v / 0.6; return [Math.round(255 * k), Math.round(214 * k * 0.8), 0]; }
  const k = (v - 0.6) / 0.4;
  return [255, Math.round(171 + 84 * k), Math.round(255 * k)];
}

/** Live 8–16 kHz spectrogram from our own FFT of the ring buffer (not an AnalyserNode). */
export function Spectrogram() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const g = canvas.getContext('2d')!;
    const plan = RealFftPlan.forSize(FFT);
    const w = hannWindow(FFT);
    const power = new Float64Array(plan.binCount);
    const frame = new Float32Array(FFT);
    let raf = 0;
    let lastOnsets = engine.onsetCount;
    let lastWrite = -1;
    const draw = (): void => {
      raf = requestAnimationFrame(draw);
      const ring = engine.ring;
      if (!ring || ring.writeIndex < FFT || ring.writeIndex === lastWrite) return;
      lastWrite = ring.writeIndex;
      if (ring.readLatest(FFT, frame) !== 'ok') return;
      plan.power(frame, power, w.values);
      const binHz = ring.sampleRate / FFT;
      const k0 = Math.ceil(LO / binHz), k1 = Math.floor(HI / binHz);
      const rows = canvas.height;
      g.drawImage(canvas, -1, 0);
      const img = g.createImageData(1, rows);
      for (let r = 0; r < rows; r++) {
        const hz = HI - ((r + 0.5) / rows) * (HI - LO);
        const k = Math.min(k1, Math.max(k0, Math.round(hz / binHz)));
        const db = 10 * Math.log10((4 * power[k]!) / (w.sum * w.sum) + 1e-20);
        const [R, G, B] = colour((db - DB_MIN) / (DB_MAX - DB_MIN));
        img.data.set([R, G, B, 255], r * 4);
      }
      g.putImageData(img, COLS - 1, 0);
      if (engine.onsetCount !== lastOnsets) {
        lastOnsets = engine.onsetCount;
        g.fillStyle = '#ffffff';
        g.fillRect(COLS - 3, 0, 2, 6);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rows = 160;
  const toneY = (1 - (PARAMS.nominalToneHz - LO) / (HI - LO)) * 100;
  return (
    <div class="spectro" role="img" aria-label="Live spectrogram from 8 to 16 kilohertz">
      <canvas ref={ref} width={COLS} height={rows} />
      <div class="spectro-tone" style={{ top: `${toneY}%` }} title="nominal tone" />
      {[16, 14, 12, 10, 8].map((k) => (
        <span class="spectro-tick" key={k} style={{ top: `${((16 - k) / 8) * 100}%` }}>{k} kHz</span>
      ))}
    </div>
  );
}
