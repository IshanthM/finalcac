import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { engine, type CapturedEvent } from '../audio/engine.ts';
import { keepAwake } from '../audio/wakeLock.ts';
import { unlockOutputs } from '../alert/unlock.ts';
import { evaluateCalibration, type CalibrationRing } from '../dsp/calibration.ts';
import { toleranceFrac, type TagProfile } from '../dsp/profile.ts';
import { PARAMS } from '../dsp/params.ts';
import { getState, go, setState } from '../state.ts';
import { useEngine } from './useEngine.ts';

const hz = (v: number): string => Math.round(v).toLocaleString('en-US');

/** Why a heard event was not a usable calibration ring. */
function whyNot(ev: CapturedEvent): string {
  const g = ev.verdict.gates;
  return ev.verdict.failed.filter((n) => n !== 'tolerance').map((n) => g[n].text).join('; ');
}

export function Calibrate() {
  const e = useEngine();
  const [rings, setRings] = useState<(CalibrationRing | null)[]>(() => Array.from({ length: PARAMS.calibRings }, () => null));
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const ringsRef = useRef(rings);
  ringsRef.current = rings;

  useEffect(() => {
    engine.setMode('calibrate');
    const off = engine.onEvent((ev) => {
      if (!ev.calibrating) return;
      const cur = ringsRef.current;
      const slot = cur.findIndex((r) => r === null);
      if (slot < 0) return;
      if (!ev.verdict.accepted || ev.analysis.peak === null) {
        setNote(`Heard something, but it did not look like a tag ring (${whyNot(ev)}). Re-arm and ring again.`);
        return;
      }
      const next = cur.slice();
      next[slot] = { freqHz: ev.analysis.peak.freqHz, tauMs: ev.analysis.tauMs };
      setRings(next);
      setNote(slot + 1 < next.length ? `Ring ${slot + 1} of ${next.length}: got ${hz(ev.analysis.peak.freqHz)} Hz. Re-arm and ring again.` : '');
    });
    return () => { off(); engine.setMode('detect'); };
  }, []);

  const status = useMemo(() => evaluateCalibration(rings), [rings]);
  const next = rings.findIndex((r) => r === null);
  const running = e.info.state === 'running';

  const start = (): void => { unlockOutputs(); void keepAwake(); void e.start(); };
  const redo = (i: number): void => {
    setRings((r) => r.map((v, k) => (k === i ? null : v)));
    setNote(`Redo ring ${i + 1}: re-arm and ring.`);
  };
  const reset = (): void => { setRings(Array.from({ length: PARAMS.calibRings }, () => null)); setNote(''); setSaved(false); };
  const save = (): void => {
    if (status.kind !== 'ok') return;
    const profile: TagProfile = { ...status.profile, sampleRate: e.info.sampleRate, calibratedAt: new Date().toISOString() };
    setState({ profile });
    engine.setProfile(profile);
    setSaved(true);
  };

  return (
    <main class="page">
      <h1>Calibrate tag</h1>
      <p>Ring the tag {PARAMS.calibRings} separate times, re-arming it between rings. Using different tags across the rings makes the profile cover tag-to-tag spread.</p>
      {!running && (
        <div class="actions">
          <button class="btn btn-primary" onClick={start} disabled={e.info.state === 'starting'}>Start listening</button>
        </div>
      )}
      {e.info.error && <p class="error" role="alert">Mic error: {e.info.error}</p>}

      <ol class="rings" aria-label="Calibration rings">
        {rings.map((r, i) => (
          <li key={i} class={`ring ${r ? 'done' : i === next ? 'current' : ''}`} aria-current={i === next ? 'step' : undefined}>
            <span class="ring-n">Ring {i + 1}</span>
            <span class="ring-v">{r ? `${hz(r.freqHz)} Hz` : i === next ? (running ? 'listening…' : 'waiting') : '—'}</span>
          </li>
        ))}
      </ol>

      <p role="status" aria-live="polite" class="note">{note || (running && next >= 0 ? `Ring ${next + 1} of ${rings.length}: ring the tag now.` : '')}</p>

      {status.kind === 'disagree' && (
        <section class="panel" aria-label="Rings that disagree">
          <h2 class="warn">The rings don't agree</h2>
          <p>All {PARAMS.calibRings} must be within {(PARAMS.calibAgreeFrac * 100).toFixed(1)}% of the median ({hz(status.median)} Hz).</p>
          <ul class="list">
            {status.offenders.map((o) => (
              <li class="row" key={o.index}>
                <span>{o.message}</span>
                <button class="btn" aria-label={`Redo ring ${o.index + 1}`} onClick={() => redo(o.index)}>Redo ring {o.index + 1}</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {status.kind === 'ok' && (
        <section class="panel" aria-label="Calibration result">
          <h2>All {PARAMS.calibRings} rings agree</h2>
          <dl class="kv">
            <dt>Tag frequency</dt><dd>{hz(status.profile.freqHz)} Hz</dd>
            <dt>Spread</dt><dd>±{(status.profile.spreadFrac * 100).toFixed(2)}%</dd>
            <dt>Accepts</dt><dd>±{(toleranceFrac(status.profile.spreadFrac) * 100).toFixed(2)}% ({hz(status.profile.freqHz * (1 - toleranceFrac(status.profile.spreadFrac)))}–{hz(status.profile.freqHz * (1 + toleranceFrac(status.profile.spreadFrac)))} Hz)</dd>
            <dt>Decay τ</dt><dd>{status.profile.decayMs.toFixed(1)} ms</dd>
          </dl>
          <div class="actions">
            {!saved
              ? <button class="btn btn-primary" onClick={save}>Save as store tag profile</button>
              : <button class="btn btn-primary" onClick={() => go('')}>Saved. Back to home</button>}
            <button class="btn" onClick={reset}>Start over</button>
          </div>
        </section>
      )}

      {getState().profile && status.kind !== 'ok' && (
        <p class="muted">Current profile: {hz(getState().profile!.freqHz)} Hz ±{(toleranceFrac(getState().profile!.spreadFrac) * 100).toFixed(2)}%. Finishing a new calibration replaces it.</p>
      )}
      <div class="actions"><button class="btn" onClick={() => go('')}>Back</button>{status.kind !== 'ok' && <button class="btn" onClick={reset}>Start over</button>}</div>
    </main>
  );
}
