import { useEffect, useRef, useState } from 'preact/hooks';
import { acknowledge, raise } from '../alert/alarm.ts';
import { chime } from '../alert/siren.ts';
import { unlockOutputs } from '../alert/unlock.ts';
import { engine } from '../audio/engine.ts';
import { keepAwake } from '../audio/wakeLock.ts';
import { kindFor, type Incident, type Report } from '../dsp/dedupe.ts';
import { parseProfile } from '../dsp/profile.ts';
import { attachReporter } from '../hub/reporter.ts';
import { clearQueue, pushQueue, readQueue } from '../net/offlineQueue.ts';
import { closeSession, consolesOnline, nudgeSession, openSession, pushProfile, sendDetect, sessionStatus, useSessionStatus } from '../net/session.ts';
import { getState, go, setState, useAppState } from '../state.ts';
import { AlertOverlay } from './AlertOverlay.tsx';
import { ListenerHero } from './ListenerHero.tsx';
import { Bezel } from './Bezel.tsx';
import { Reveal } from './Reveal.tsx';
import { useEngine } from './useEngine.ts';
import { ZoneForm } from './ZoneForm.tsx';

interface Seen { id: number; at: number; text: string }

/** A listener phone: hears rings, reports them to the store, and alarms locally when staff cannot be reached. */
export function Listener() {
  const s = useAppState();
  const e = useEngine();
  const status = useSessionStatus();
  const [seen, setSeen] = useState<Seen[]>([]);
  const nextId = useRef(1);
  const code = s.storeCode;
  const zone = s.zone;

  const note = (text: string): void => setSeen((l) => [{ id: nextId.current++, at: Date.now(), text }, ...l].slice(0, 8));

  // Connection to the store.
  useEffect(() => {
    if (!code || !zone) return;
    const client = openSession({
      code, role: 'listener', zone,
      onMessage: (m) => {
        if (m.t === 'state' || m.t === 'profile') {
          const remote = parseProfile(m.profile);
          const local = getState().profile;
          if (remote && (!local || remote.calibratedAt > local.calibratedAt)) { setState({ profile: remote }); engine.setProfile(remote); }
          else if (!remote && local) pushProfile(local); // the store has none yet: share ours
        }
        if (m.t === 'state' || m.t === 'zones') { /* consoles count is read from the session */ }
      },
    });
    const flush = (): void => {
      for (const q of readQueue()) sendDetect(q.snr, q.freq, { delayed: true, test: q.test });
      clearQueue();
    };
    const timer = setInterval(() => { if (client.status === 'open' && readQueue().length > 0) flush(); }, 1500);
    const online = (): void => nudgeSession();
    addEventListener('online', online);
    document.addEventListener('visibilitychange', online);
    return () => { clearInterval(timer); removeEventListener('online', online); document.removeEventListener('visibilitychange', online); };
  }, [code, zone?.name, zone?.type]);

  // Detections → relay, or a local alarm when staff cannot be reached.
  useEffect(() => {
    engine.setMode('detect');
    return attachReporter(() => getState().zone, (r) => handleReport(r));
  }, []);

  function handleReport(r: Report, test = false): void {
    // Read live state: this runs from a long-lived subscription, so render-time values would be stale.
    const reachable = sessionStatus() === 'open' && consolesOnline() > 0;
    const sent = sendDetect(r.snrDb, r.freqHz, { test });
    if (sent) { /* queued in the relay's dedupe window */ } else pushQueue({ snr: r.snrDb, freq: r.freqHz, at: Date.now(), test });
    if (kindFor(r.zoneType) === 'checkout') {
      note('Checkout heard');
      if (!sent) chime();
      return;
    }
    if (sent && reachable) {
      note(`${test ? 'Test: ' : ''}Tamper heard. Staff alerted.`);
    } else {
      note(`${test ? 'Test: ' : ''}Tamper heard. ${sent ? 'No staff console online' : 'No connection'}: alerting here.`);
      const inc: Incident = {
        id: `local-${Date.now()}`, at: Date.now(), zone: r.zone, zoneType: r.zoneType, snrDb: r.snrDb, freqHz: r.freqHz,
        kind: 'tamper', alsoHeardBy: [], ...(test ? { test: true } : {}),
      };
      raise(inc);
    }
  }

  if (!code) return <main class="page narrow"><h1>No store joined</h1><button class="btn btn-primary" onClick={() => go('join/listener')}>Join a store</button></main>;
  if (!zone) {
    return (
      <main class="page narrow">
        <Reveal as="h1">Name this listener</Reveal>
        <Reveal i={1} as="p" class="lede">Store <span class="mono">{code}</span>. Each phone gets a zone, so staff know where a ring was heard.</Reveal>
        <Reveal i={2}><ZoneForm initial={null} cta="Save zone" onSave={(z) => setState({ zone: z })} /></Reveal>
      </main>
    );
  }

  const running = e.info.state === 'running';
  const start = (): void => { unlockOutputs(); void keepAwake(); void e.start(); };
  const test = (): void => {
    unlockOutputs();
    handleReport({ zone: zone.name, zoneType: zone.type, snrDb: 24, freqHz: s.profile?.freqHz ?? 13300, test: true }, true);
  };
  const connLabel = status === 'open'
    ? `Store ${code}, ${consolesOnline() === 0 ? 'no staff console online' : 'connected'}`
    : status === 'connecting' ? 'Connecting' : 'Offline, alerts stay on this phone';

  return (
    <main class="page">
      <AlertOverlay onAck={() => undefined} />
      <div class="cols two">
        <Reveal class="sticky">
          <Bezel tone="blue">
            <p class={`chip ${status === 'open' ? 'ok' : 'warnchip'}`} role="status" aria-live="polite">{connLabel}</p>
            <ListenerHero zone={zone} />
            <div class="actions center">
              {!running && e.info.state !== 'suspended' && <button class="btn btn-primary" onClick={start} disabled={e.info.state === 'starting'}>Start listening</button>}
              {running && <button class="btn" onClick={() => e.stop()}>Stop listening</button>}
              <button class="btn" onClick={test}>Test alert</button>
            </div>
            {e.info.error && <p class="error" role="alert">Mic error: {e.info.error}</p>}
          </Bezel>
        </Reveal>
        <div>
          {!s.profile && (
            <Reveal>
              <Bezel tone="amber" aria-label="Calibration needed">
                <h2 class="warn">Calibrate first</h2>
                <p>This store has no tag profile yet. Calibrate once and every listener in the store gets it.</p>
                <button class="btn btn-primary" onClick={() => go('calibrate')}>Calibrate tag</button>
              </Bezel>
            </Reveal>
          )}
          <Reveal as="h2" style={{ marginTop: s.profile ? '0' : undefined }}>Heard here</Reveal>
          <Reveal i={1}>
            {seen.length === 0
              ? <div class="empty"><strong>Nothing yet</strong><span>Detections on this phone show up here.</span></div>
              : <ul class="list" aria-label="Recent detections">{seen.map((x) => <li class="row" key={x.id}><span>{new Date(x.at).toLocaleTimeString()}</span><span>{x.text}</span></li>)}</ul>}
          </Reveal>
          <div class="actions">
            <button class="btn btn-quiet" onClick={() => setState({ zone: null })}>Change zone</button>
            <button class="btn btn-quiet" onClick={() => { acknowledge(); closeSession(); e.stop(); setState({ storeCode: null, role: null, zone: null }); go(''); }}>Leave store</button>
          </div>
        </div>
      </div>
    </main>
  );
}
