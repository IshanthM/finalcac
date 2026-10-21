import { engine } from '../audio/engine.ts';
import { wakeLockActive } from '../audio/wakeLock.ts';
import type { Zone } from '../state.ts';
import { LiveTrace } from './LiveTrace.tsx';
import { Orb } from './Orb.tsx';
import { useEngine } from './useEngine.ts';

/** Listening state, zone name, a live spectrum line and a level meter. */
export function ListenerHero({ zone }: { zone: Zone }) {
  const e = useEngine();
  const st = e.info.state;
  const dbfs = e.level.peak > 0 ? 20 * Math.log10(e.level.peak) : -120;
  const pct = Math.max(0, Math.min(100, ((dbfs + 90) / 90) * 100));
  const label = st === 'running' ? 'Listening' : st === 'starting' ? 'Starting' : st === 'suspended' ? 'Paused' : 'Not listening';
  return (
    <section class={`stage ${st === 'running' ? 'on' : ''}`} aria-label="Listener status">
      <div class="stage-head">
        <Orb live on={st === 'running'} small />
        <div>
          <p class="hero-label" role="status" aria-live="polite">{label}</p>
          <h1 class="hero-zone">{zone.name}</h1>
        </div>
      </div>
      <LiveTrace />
      <div class="meter" role="meter" aria-label="Input level" aria-valuemin={-90} aria-valuemax={0} aria-valuenow={Math.round(dbfs)}>
        <div class="meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <span class="meter-text">{dbfs <= -119 ? 'No signal' : `${dbfs.toFixed(0)} dBFS`}</span>
      {st === 'running' && <p class="hero-sub">Mic on at <span class="mono">{e.info.sampleRate} Hz</span>. Screen {wakeLockActive() ? 'kept awake' : 'may sleep'}.</p>}
      {st === 'suspended' && <div class="actions"><button class="btn btn-primary" onClick={() => void engine.resume()}>Tap to resume mic</button></div>}
    </section>
  );
}
