import { useEffect, useMemo } from 'preact/hooks';
import { engine } from '../audio/engine.ts';
import { keepAwake } from '../audio/wakeLock.ts';
import { unlockOutputs } from '../alert/unlock.ts';
import { LocalHub } from '../hub/localHub.ts';
import { clearIncidents, useIncidents } from '../hub/incidents.ts';
import { attachReporter } from '../hub/reporter.ts';
import { getState, go, setState, useAppState } from '../state.ts';
import { AlertOverlay } from './AlertOverlay.tsx';
import { EventLog } from './EventLog.tsx';
import { ListenerHero } from './ListenerHero.tsx';
import { TopBar } from './TopBar.tsx';
import { useEngine } from './useEngine.ts';
import { ZoneForm } from './ZoneForm.tsx';

/** One phone as both listener and staff console: the full alert flow on a single device (for filming). */
export function Demo() {
  const s = useAppState();
  const e = useEngine();
  const incidents = useIncidents();
  const hub = useMemo(() => new LocalHub(), []);

  useEffect(() => {
    hub.start();
    engine.setMode('detect');
    const off = attachReporter(() => getState().zone, (r) => hub.submit(r));
    return () => { off(); hub.stop(); };
  }, [hub]);

  const zone = s.zone;
  const running = e.info.state === 'running';
  const start = (): void => { unlockOutputs(); void keepAwake(); void e.start(); };
  const test = (): void => {
    unlockOutputs();
    if (zone) hub.submit({ zone: zone.name, zoneType: zone.type, snrDb: 24, freqHz: s.profile?.freqHz ?? 13300, test: true });
  };
  const testTwo = (): void => {
    unlockOutputs();
    if (!zone) return;
    hub.submit({ zone: zone.name, zoneType: zone.type, snrDb: 24, freqHz: s.profile?.freqHz ?? 13300, test: true });
    hub.submit({ zone: 'Sales Floor', zoneType: 'floor', snrDb: 13, freqHz: s.profile?.freqHz ?? 13300, test: true });
  };

  return (
    <main class="page">
      <AlertOverlay />
      <TopBar title="Demo mode" home />

      {!zone ? (
        <>
          <h1>Set up this zone</h1>
          <p class="lede">In demo mode this phone is both the listener and the staff console.</p>
          <ZoneForm initial={null} cta="Save zone" onSave={(z) => setState({ zone: z, role: 'demo' })} />
        </>
      ) : (
        <>
          <ListenerHero zone={zone} />
          {!s.profile && (
            <section class="panel" aria-label="Calibration needed">
              <h2 class="warn">Calibrate first</h2>
              <p>Without a tag profile, real rings are not accepted. The test buttons below still work.</p>
              <button class="btn btn-primary" onClick={() => go('calibrate')}>Calibrate tag</button>
            </section>
          )}
          <div class="actions" style={{ justifyContent: 'center' }}>
            {!running && e.info.state !== 'suspended' && (
              <button class="btn btn-primary" onClick={start} disabled={e.info.state === 'starting'}>Start listening</button>
            )}
            {running && <button class="btn" onClick={() => e.stop()}>Stop listening</button>}
            <button class="btn btn-quiet" onClick={() => setState({ zone: null })}>Change zone</button>
          </div>
          {e.info.error && <p class="error" role="alert">Mic error: {e.info.error}</p>}

          <h2>Staff console</h2>
          <EventLog items={incidents} />
          <div class="actions">
            <button class="btn" onClick={test}>Test alarm</button>
            <button class="btn" onClick={testTwo}>Test: heard by two zones</button>
            <button class="btn btn-quiet" onClick={() => clearIncidents()}>Clear log</button>
          </div>
          <p class="muted">Tests use the same dedupe, register rule and alert as a real ring, and are marked “test” in the log.</p>
        </>
      )}
    </main>
  );
}
