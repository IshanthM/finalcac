import { useEffect, useRef } from 'preact/hooks';
import { engine } from '../audio/engine.ts';
import { RealFftPlan } from '../dsp/fft.ts';
import { hannWindow } from '../dsp/window.ts';
import { toleranceFrac } from '../dsp/profile.ts';
import { getState } from '../state.ts';

const LO = 8000;
const HI = 16000;
const FFT = 1024;
const TAN = '210,185,154';

/** Live 8 to 16 kHz spectrum as a single line, with the calibrated tag band marked. Redraws at ~16 fps and pauses when hidden. */
export function LiveTrace() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = canvas.current!;
    const g = c.getContext('2d')!;
    const plan = RealFftPlan.forSize(FFT);
    const w = hannWindow(FFT);
    const power = new Float64Array(plan.binCount);
    const frame = new Float32Array(FFT);
    let smooth: Float32Array | null = null;
    const resize = (): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.max(1, Math.round(c.clientWidth * dpr));
      c.height = Math.max(1, Math.round(c.clientHeight * dpr));
      smooth = null;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);

    const draw = (): void => {
      if (document.hidden) return;
      const W = c.width, H = c.height;
      g.clearRect(0, 0, W, H);
      g.lineWidth = Math.max(1, W / 600);
      // grid: one line per 2 kHz
      g.strokeStyle = 'rgba(255,255,255,0.07)';
      g.beginPath();
      for (let k = 0; k <= 4; k++) { const x = Math.round((k / 4) * (W - 1)) + 0.5; g.moveTo(x, 0); g.lineTo(x, H); }
      g.stroke();
      // calibrated tag band
      const p = getState().profile;
      if (p) {
        const tol = toleranceFrac(p.spreadFrac);
        const x0 = ((p.freqHz * (1 - tol) - LO) / (HI - LO)) * W;
        const x1 = ((p.freqHz * (1 + tol) - LO) / (HI - LO)) * W;
        g.fillStyle = `rgba(${TAN},0.12)`;
        g.fillRect(x0, 0, Math.max(2, x1 - x0), H);
        g.strokeStyle = `rgba(${TAN},0.8)`;
        const xc = ((p.freqHz - LO) / (HI - LO)) * W;
        g.beginPath(); g.moveTo(xc, 0); g.lineTo(xc, H); g.stroke();
      }
      // spectrum line
      const ring = engine.ring;
      const live = engine.info.state === 'running' && ring && ring.writeIndex >= FFT && ring.readLatest(FFT, frame) === 'ok';
      const n = Math.max(2, Math.floor(W / 3));
      if (!smooth || smooth.length !== n) smooth = new Float32Array(n).fill(-120);
      if (live && ring) {
        plan.power(frame, power, w.values);
        const binHz = ring.sampleRate / FFT;
        for (let i = 0; i < n; i++) {
          const hz = LO + (i / (n - 1)) * (HI - LO);
          const k = Math.min(power.length - 2, Math.max(1, Math.round(hz / binHz)));
          const db = 10 * Math.log10((4 * power[k]!) / (w.sum * w.sum) + 1e-20);
          smooth[i] = smooth[i]! * 0.55 + db * 0.45;
        }
      } else {
        for (let i = 0; i < n; i++) smooth[i] = smooth[i]! * 0.8 - 120 * 0.2;
      }
      const yOf = (db: number): number => H - Math.max(0, Math.min(1, (db + 105) / 65)) * (H - 6) - 2;
      g.beginPath();
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * W; const y = yOf(smooth[i]!); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.strokeStyle = `rgba(${TAN},0.95)`;
      g.stroke();
      g.lineTo(W, H); g.lineTo(0, H); g.closePath();
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, `rgba(${TAN},0.22)`); grad.addColorStop(1, `rgba(${TAN},0)`);
      g.fillStyle = grad; g.fill();
    };
    const id = setInterval(draw, 60);
    draw();

    let flagTimer: ReturnType<typeof setTimeout> | null = null;
    const off = engine.onEvent((ev) => {
      if (!ev.verdict.accepted) return;
      box.current?.classList.add('hit');
      if (flagTimer) clearTimeout(flagTimer);
      flagTimer = setTimeout(() => box.current?.classList.remove('hit'), 2200);
    });
    return () => { clearInterval(id); ro.disconnect(); off(); if (flagTimer) clearTimeout(flagTimer); };
  }, []);

  return (
    <div class="live" ref={box}>
      <canvas ref={canvas} role="img" aria-label="Live spectrum from 8 to 16 kilohertz with the tag band marked" />
      <span class="live-flag">Tag ring heard</span>
      <div class="live-axis" aria-hidden="true"><span>8</span><span>10</span><span>12</span><span>14</span><span>16 kHz</span></div>
    </div>
  );
}
