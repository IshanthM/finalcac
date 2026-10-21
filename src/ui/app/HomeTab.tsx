import { useState } from 'preact/hooks';
import { useAlarms } from '../../alert/alarm.ts';
import { engine } from '../../audio/engine.ts';
import { wakeLockActive } from '../../audio/wakeLock.ts';
import { ackIncident, useIncidents } from '../../hub/incidents.ts';
import { enableAlerts, simulateRing, startListening, useRuntime } from '../../runtime.ts';
import { useSessionStatus, consolesOnline } from '../../net/session.ts';
import { go, useAppState, ZONE_TYPE_LABEL } from '../../state.ts';
import { acknowledge } from '../../alert/alarm.ts';
import { acknowledgeAlert } from '../../runtime.ts';
import { ChooseRole } from './ChooseRole.tsx';
import { Head, Row } from './parts.tsx';
import { EventLog } from '../EventLog.tsx';
import { Icon } from '../Icon.tsx';
import { LiveTrace } from '../LiveTrace.tsx';
import { Orb } from '../Orb.tsx';
import { useEngine } from '../useEngine.ts';

/** Home: what is happening on this phone right now, for whichever role it plays. */
export function HomeTab({ openZoneSheet }: { openZoneSheet: () => void }) {
  const s = useAppState();
  const e = useEngine();
  const incidents = useIncidents();
  const alarms = useAlarms();
  const rt = useRuntime();
  const status = useSessionStatus();
  const [copied, setCopied] = useState(false);
  if (!s.role) return <ChooseRole />;

  const open = incidents.filter((i) => i.kind === 'tamper' && !i.ackedAt && !i.test);
  const recent = incidents.slice(0, 3);
  const running = e.info.state === 'running';
  const dbfs = e.level.peak > 0 ? 20 * Math.log10(e.level.peak) : -120;
  const pct = Math.max(0, Math.min(100, ((dbfs + 90) / 90) * 100));
  const ack = (id: string): void => { ackIncident(id); acknowledge(id); acknowledgeAlert(id); };
  const copy = async (): Promise<void> => {
    try { await navigator.clipboard.writeText(s.storeCode ?? ''); } catch { /* clipboard blocked: the code is on screen */ }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };
  const conn = status === 'open' ? (consolesOnline() === 0 && s.role === 'listener' ? 'Connected, no staff console online' : 'Connected') : status === 'connecting' ? 'Connecting' : 'Offline, alerts stay on this phone';

  // ----- staff -----
  if (s.role === 'staff') {
    const onlineZones = rt.zones.filter((z) => z.online).length;
    const alarm = alarms.length > 0 || open.length > 0;
    return (
      <div class="screen">
        <Head title="Home" sub={s.storeCode ? `Store ${s.storeCode}` : undefined} />
        <section class={`status-card ${alarm ? 'alarm' : ''}`} aria-label="Store status">
          <p class="status-big">{alarm ? `${Math.max(open.length, alarms.length)} open ${open.length === 1 ? 'alert' : 'alerts'}` : 'All quiet'}</p>
          <p class="status-sub">{conn}</p>
          <div class="actions">
            {!rt.armed
              ? <button class="btn btn-primary" onClick={enableAlerts}>Enable alerts</button>
              : <span class="chip ok">Siren and voice on</span>}
            <button class="btn btn-tint" onClick={() => go('alerts')}>Open alerts</button>
          </div>
          {!rt.armed && <p class="status-sub">Tap once so this phone can play the siren and speak alerts, then keep this screen open.</p>}
        </section>

        <p class="sect">Store</p>
        <div class="group">
          <div class="row"><span class="row-main"><span class="row-sub">Store code. Enter it on each listener phone.</span><span class="code-big" aria-label={`Store code ${(s.storeCode ?? '').split('').join(' ')}`}>{s.storeCode}</span></span></div>
          <div class="row">
            <button class="code-copy" onClick={() => void copy()} aria-label={`Copy store code ${s.storeCode}`}>
              <span class="swap"><Icon name="copy" cls={copied ? 'off' : ''} /><Icon name="check" cls={copied ? '' : 'off'} /></span>
              <span aria-hidden="true">{copied ? 'Copied' : 'Copy code'}</span>
            </button>
            <span class="sr-only" role="status" aria-live="polite">{copied ? 'Store code copied' : ''}</span>
          </div>
          <Row icon="squares" title="Zones" value={`${onlineZones} of ${rt.zones.length} online`} onClick={() => go('zones')} />
          <Row icon="tune" tone="blue" title="Tag profile" value={s.profile ? `${Math.round(s.profile.freqHz).toLocaleString('en-US')} Hz` : 'Not calibrated'} onClick={() => go('calibrate')} />
        </div>

        <p class="sect">Recent alerts</p>
        <EventLog items={recent} onAck={ack} />
      </div>
    );
  }

  // ----- listener and demo -----
  const zone = s.zone;
  return (
    <div class="screen">
      <Head title="Home" sub={s.role === 'demo' ? 'Demo mode: this phone plays both roles' : s.storeCode ? `Store ${s.storeCode}` : undefined} />
      <section class="status-card" aria-label="Listener status">
        <div class="status-top">
          <Orb live on={running} small />
          <div>
            <p class="status-big" role="status" aria-live="polite">{running ? 'Listening' : e.info.state === 'starting' ? 'Starting' : e.info.state === 'suspended' ? 'Paused' : 'Not listening'}</p>
            <p class="status-sub">{zone ? `${zone.name}, ${ZONE_TYPE_LABEL[zone.type]}` : 'No zone yet'}</p>
          </div>
        </div>
        <LiveTrace />
        <div class="meter" role="meter" aria-label="Input level" aria-valuemin={-90} aria-valuemax={0} aria-valuenow={Math.round(dbfs)}><div class="meter-fill" style={{ width: `${pct}%` }} /></div>
        <span class="meter-text">{dbfs <= -119 ? 'No signal' : `${dbfs.toFixed(0)} dBFS`}{running ? `, mic on at ${e.info.sampleRate} Hz, screen ${wakeLockActive() ? 'kept awake' : 'may sleep'}` : ''}</span>
        {e.info.error && <p class="error" role="alert">{e.info.error}</p>}
        <div class="actions">
          {!running && e.info.state !== 'suspended'
            ? <button class="btn btn-primary" onClick={startListening} disabled={e.info.state === 'starting'}>Start listening</button>
            : e.info.state === 'suspended'
              ? <button class="btn btn-primary" onClick={() => void engine.resume()}>Tap to resume mic</button>
              : <button class="btn" onClick={() => engine.stop()}>Stop listening</button>}
          <button class="btn btn-tint" onClick={() => simulateRing(false)}>Simulate a tag ring</button>
          {s.role === 'demo' && <button class="btn btn-plain" onClick={() => simulateRing(true)}>Simulate two phones hearing it</button>}
        </div>
      </section>

      <p class="sect">This phone</p>
      <div class="group">
        <Row icon="pin" title="Zone" value={zone?.name ?? 'Set a zone'} onClick={openZoneSheet} />
        <Row icon="tune" tone="blue" title="Tag profile" sub={s.profile ? undefined : 'Calibrate so real rings are accepted'} value={s.profile ? `${Math.round(s.profile.freqHz).toLocaleString('en-US')} Hz` : 'Not calibrated'} onClick={() => go('calibrate')} />
        {s.role === 'listener' && <Row icon="broadcast" tone="amber" title="Connection" value={conn} chevron={false} />}
      </div>

      <p class="sect">Recent alerts</p>
      <EventLog items={recent} onAck={s.role === 'demo' ? ack : undefined} />
      {incidents.length > 3 && <div class="actions"><button class="btn btn-plain" onClick={() => go('alerts')}>See all alerts</button></div>}
    </div>
  );
}
