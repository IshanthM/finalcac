import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { engine, type CapturedEvent } from '../audio/engine.ts';
import { keepAwake } from '../audio/wakeLock.ts';
import { unlockOutputs } from '../alert/unlock.ts';
import { evaluateCalibration, type CalibrationRing } from '../dsp/calibration.ts';
import { toleranceFrac, type TagProfile } from '../dsp/profile.ts';
import { PARAMS } from '../dsp/params.ts';
import { pushProfile } from '../net/session.ts';
import { getState, goBack, setState } from '../state.ts';
import { Icon } from './Icon.tsx';
import { Bezel } from './Bezel.tsx';
import { Reveal } from './Reveal.tsx';
import { useEngine } from './useEngine.ts';

const hz = (v: number): string => Math.round(v).toLocaleString('en-US');

/** Why a heard event was not a usable calibration ring, in words a person can act on. */
function whyNot(ev: CapturedEvent): string {
  const failed = ev.verdict.failed.filter((n) => n !== 'tolerance');
  if (failed.includes('snr')) return 'The ring was too quiet. Hold the phone closer to the tag.';
  if (failed.includes('guard')) return 'Other sounds were mixed in. Try again in a quieter moment.';
  return 'It did not sound like a tag ring.';
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
        setNote(`${whyNot(ev)} Re-arm the tag and ring again.`);
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
    pushProfile(profile); // shared with the whole store when connected; otherwise sent on the next connect
    setSaved(true);
  };

  const p = getState().profile;
  return (
    <main class="page">
      <Reveal as="h1">Calibrate tag</Reveal>
      <Reveal i={1} as="p" class="lede">Ring the tag {PARAMS.calibRings} separate times and re-arm it between rings. Use different tags to cover tag-to-tag spread.</Reveal>
      <div class="cols two even">
        <div>
          {!running && (
            <div class="actions" style={{ marginTop: 0 }}>
              <button class="btn btn-primary" onClick={start} disabled={e.info.state === 'starting'}>Start listening</button>
            </div>
          )}
          {e.info.error && <p class="error" role="alert">Mic error: {e.info.error}</p>}
          <Reveal i={1}>
            <ol class="rings" aria-label="Calibration rings">
              {rings.map((r, i) => (
                <li key={i} class={`ring ${r ? 'done' : i === next ? 'current' : ''}`} aria-current={i === next ? 'step' : undefined}>
                  <span class="ring-dot" aria-hidden="true">{r ? <Icon name="check" /> : i + 1}</span>
                  <span class="ring-n">Ring {i + 1}</span>
                  <span class="ring-v">{r ? `${hz(r.freqHz)} Hz` : i === next ? (running ? 'listening' : 'waiting') : 'Not yet'}</span>
                </li>
              ))}
            </ol>
          </Reveal>
          <p role="status" aria-live="polite" class="note" style={{ marginTop: '18px' }}>{note || (running && next >= 0 ? `Ring ${next + 1} of ${rings.length}: ring the tag now.` : '')}</p>
          {status.kind !== 'ok' && <div class="actions" style={{ marginTop: 0 }}><button class="btn btn-quiet" onClick={reset}>Start over</button></div>}
        </div>

        <div class="stack">
          <Reveal i={2}>
            <Bezel tone="tan">
              <h2 class="sub">Ring agreement</h2>
              <p class="muted">Every ring must land inside the band around the median.</p>
              <AgreementStrip rings={rings} />
              {rings.filter(Boolean).length < 2 && <p class="muted">The strip fills in as you ring.</p>}
            </Bezel>
          </Reveal>

          {status.kind === 'disagree' && (
            <Bezel tone="amber" aria-label="Rings that disagree">
              <h2 class="warn">The rings don't agree</h2>
              <p>All {PARAMS.calibRings} must be within {(PARAMS.calibAgreeFrac * 100).toFixed(1)}% of the median (<span class="mono">{hz(status.median)} Hz</span>).</p>
              <ul class="list">
                {status.offenders.map((o) => (
                  <li class="row" key={o.index}>
                    <span style={{ fontFamily: 'var(--font)', color: 'var(--text)' }}>{o.message}</span>
                    <button class="btn" aria-label={`Redo ring ${o.index + 1}`} onClick={() => redo(o.index)}>Redo ring {o.index + 1}</button>
                  </li>
                ))}
              </ul>
            </Bezel>
          )}

          {status.kind === 'ok' && (
            <Bezel tone="blue" aria-label="Calibration result">
              <h2>All {PARAMS.calibRings} rings agree</h2>
              <dl class="kv">
                <dt>Tag frequency</dt><dd>{hz(status.profile.freqHz)} Hz</dd>
                <dt>Spread</dt><dd>±{(status.profile.spreadFrac * 100).toFixed(2)}%</dd>
                <dt>Accepts</dt><dd>±{(toleranceFrac(status.profile.spreadFrac) * 100).toFixed(2)}% ({hz(status.profile.freqHz * (1 - toleranceFrac(status.profile.spreadFrac)))} to {hz(status.profile.freqHz * (1 + toleranceFrac(status.profile.spreadFrac)))} Hz)</dd>
                <dt>Decay τ</dt><dd>{status.profile.decayMs.toFixed(1)} ms</dd>
              </dl>
              <div class="actions">
                {!saved
                  ? <button class="btn btn-primary" onClick={save}>Save as store tag profile</button>
                  : <button class="btn btn-primary" onClick={() => goBack()}>Saved. Go back</button>}
                <button class="btn btn-quiet" onClick={reset}>Start over</button>
              </div>
            </Bezel>
          )}

          {p && status.kind !== 'ok' && (
            <p class="muted">Current profile: <span class="mono">{hz(p.freqHz)} Hz ±{(toleranceFrac(p.spreadFrac) * 100).toFixed(2)}%</span>. Finishing a new calibration replaces it.</p>
          )}
        </div>
      </div>
    </main>
  );
}

/** Each finished ring as a dot against the ±agreement band around the median: agreement at a glance. */
function AgreementStrip({ rings }: { rings: (CalibrationRing | null)[] }) {
  const have = rings.filter((r): r is CalibrationRing => r !== null);
  if (have.length < 2) return null;
  const sorted = have.map((r) => r.freqHz).sort((a, b) => a - b);
  const med = sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
  const agree = PARAMS.calibAgreeFrac;
  const devs = have.map((r) => (r.freqHz - med) / med);
  const span = Math.max(agree * 1.6, Math.max(...devs.map(Math.abs)) * 1.15);
  const pos = (d: number): number => 50 + (d / span) * 50;
  const worst = Math.max(...devs.map(Math.abs));
  return (
    <div class="agree" role="img" aria-label={`Ring agreement: the largest difference from the median is ${(worst * 100).toFixed(2)} percent; the limit is ${(agree * 100).toFixed(1)} percent.`}>
      <div class="agree-track" aria-hidden="true">
        <span class="agree-line" />
        <span class="agree-band" style={{ left: `${pos(-agree)}%`, width: `${pos(agree) - pos(-agree)}%` }} />
        <span class="agree-mid" style={{ left: '50%' }} />
        {devs.map((d, i) => <span key={i} class={`agree-dot ${Math.abs(d) > agree ? 'off' : ''}`} style={{ left: `${Math.max(2, Math.min(98, pos(d)))}%` }} />)}
      </div>
      <div class="agree-cap" aria-hidden="true"><span>-{(span * 100).toFixed(2)}%</span><span>median {hz(med)} Hz</span><span>+{(span * 100).toFixed(2)}%</span></div>
    </div>
  );
}
