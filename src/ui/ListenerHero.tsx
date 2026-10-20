import { engine } from '../audio/engine.ts';
import { wakeLockActive } from '../audio/wakeLock.ts';
import type { Zone } from '../state.ts';
import { useEngine } from './useEngine.ts';

/** "Listening: Fitting Room 2" huge, with a live level meter. */
export function ListenerHero({ zone, extra }: { zone: Zone; extra?: string }) {
  const e = useEngine();
  const st = e.info.state;
  const dbfs = e.level.peak > 0 ? 20 * Math.log10(e.level.peak) : -120;
  const pct = Math.max(0, Math.min(100, ((dbfs + 90) / 90) * 100));
  const label = st === 'running' ? 'Listening' : st === 'starting' ? 'Starting' : st === 'suspended' ? 'Paused' : 'Not listening';
  return (
    <section class={`hero ${st === 'running' ? 'on' : ''}`} aria-label="Listener status">
      <p class="hero-label" role="status" aria-live="polite">{label}{st === 'running' ? ':' : ''}</p>
      <h1 class="hero-zone">{zone.name}</h1>
      <div class="meter" role="meter" aria-label="Input level" aria-valuemin={-90} aria-valuemax={0} aria-valuenow={Math.round(dbfs)}>
        <div class="meter-fill" style={{ width: `${pct}%` }} />
        <span class="meter-text">{dbfs <= -119 ? '—' : `${dbfs.toFixed(0)} dBFS`}</span>
      </div>
      <p class="muted hero-sub">
        {st === 'running' ? `Mic on · ${e.info.sampleRate} Hz · screen ${wakeLockActive() ? 'kept awake' : 'may sleep'}` : ' '}
        {extra ? ` · ${extra}` : ''}
      </p>
      {st === 'suspended' && <button class="btn btn-primary" onClick={() => void engine.resume()}>Tap to resume mic</button>}
    </section>
  );
}
