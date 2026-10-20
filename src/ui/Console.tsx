import { useEffect, useState } from 'preact/hooks';
import type { ServerMsg, ZoneInfo } from '../../worker/src/protocol.ts';
import { acknowledge, raise, refresh, useAlarms } from '../alert/alarm.ts';
import { unlockOutputs } from '../alert/unlock.ts';
import { keepAwake } from '../audio/wakeLock.ts';
import { toleranceFrac, parseProfile } from '../dsp/profile.ts';
import { ackIncident, clearIncidents, setIncidents, upsertIncident, useIncidents } from '../hub/incidents.ts';
import { closeSession, openSession, sendAck, useSessionStatus } from '../net/session.ts';
import { go, setState, useAppState } from '../state.ts';
import { AlertOverlay } from './AlertOverlay.tsx';
import { EventLog } from './EventLog.tsx';
import { TopBar } from './TopBar.tsx';

const FRESH_MS = 2 * 60 * 1000;
const hz = (v: number): string => Math.round(v).toLocaleString('en-US');

function ZoneMap({ zones, alarming }: { zones: ZoneInfo[]; alarming: Set<string> }) {
  if (zones.length === 0) return <p class="empty">No listeners yet. On another phone, choose Listener and enter this store's code.</p>;
  return (
    <ul class="zones" aria-label="Zones">
      {zones.map((z) => {
        const alarm = alarming.has(z.name);
        return (
          <li key={z.name} class={`zone ${alarm ? 'alarm' : z.online ? 'online' : 'offline'}`}>
            <span class="zone-name">{z.name}</span>
            <span class="zone-meta">{z.type === 'register' ? 'Register' : z.type === 'fitting' ? 'Fitting room' : 'Floor'}</span>
            <span class="zone-status">{alarm ? 'TAMPER' : z.online ? 'Listening' : 'Offline'}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Staff phone: zone map, full-screen alerts with siren + speech, acknowledge, event log. */
export function Console() {
  const s = useAppState();
  const status = useSessionStatus();
  const incidents = useIncidents();
  const alarms = useAlarms();
  const [zones, setZones] = useState<ZoneInfo[]>([]);
  const [armed, setArmed] = useState(false);
  const code = s.storeCode;

  useEffect(() => {
    if (!code) return;
    clearIncidents();
    openSession({
      code, role: 'console',
      onMessage: (m: ServerMsg) => {
        switch (m.t) {
          case 'state': {
            setZones(m.zones);
            setIncidents(m.incidents);
            const remote = parseProfile(m.profile);
            if (remote) setState({ profile: remote });
            for (const i of m.incidents) if (i.kind === 'tamper' && !i.ackedAt && !i.test && m.now - i.at < FRESH_MS) raise(i);
            break;
          }
          case 'zones': setZones(m.zones); break;
          case 'incident': upsertIncident(m.incident); raise(m.incident); break;
          case 'update': upsertIncident(m.incident); refresh(m.incident); break;
          case 'ack': ackIncident(m.id, m.at); acknowledge(m.id); break;
          case 'profile': { const p = parseProfile(m.profile); if (p) setState({ profile: p }); break; }
        }
      },
    });
  }, [code]);

  if (!code) return <main class="page"><TopBar home /><h1>No store joined</h1><button class="btn btn-primary" onClick={() => go('join/staff')}>Open the console</button></main>;

  const arm = (): void => { unlockOutputs(); void keepAwake(); setArmed(true); };
  const alarming = new Set(alarms.map((a) => a.zone));
  const profile = s.profile;
  return (
    <main class="page">
      <AlertOverlay onAck={(id) => sendAck(id)} />
      <TopBar title="Staff" home />
      <h1>Staff console</h1>
      <section class="panel code-panel" aria-label="Store code">
        <span class="eyebrow">Store code</span>
        <strong class="code-big" aria-label={`Store code ${code.split('').join(' ')}`}>{code}</strong>
        <span class="muted">Enter this on each listener phone.</span>
      </section>
      <p class={`chip ${status === 'open' ? 'ok' : 'warnchip'}`} role="status" aria-live="polite">
        {status === 'open' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Offline · reconnecting'}
      </p>
      {!armed && (
        <section class="panel" aria-label="Enable alerts">
          <h2 class="warn">Enable alerts</h2>
          <p>Tap once so this phone can play the siren and speak alerts, then keep this screen open.</p>
          <button class="btn btn-primary" onClick={arm}>Enable alerts</button>
        </section>
      )}
      <h2>Zones</h2>
      <ZoneMap zones={zones} alarming={alarming} />
      <h2>Event log</h2>
      <EventLog items={incidents} />
      <h2>Tag profile</h2>
      {profile
        ? <p>{hz(profile.freqHz)} Hz, accepts ±{(toleranceFrac(profile.spreadFrac) * 100).toFixed(2)}%. Calibrated {new Date(profile.calibratedAt).toLocaleString()}.</p>
        : <p class="muted">Not calibrated yet. Calibrate a tag on this phone or on any listener.</p>}
      <div class="actions">
        <button class="btn" onClick={() => go('calibrate')}>{profile ? 'Re-calibrate' : 'Calibrate tag'}</button>
        <a class="btn" href={`${import.meta.env.BASE_URL}dashboard.html?store=${code}`}>Dashboard</a>
        <button class="btn btn-quiet" onClick={() => { acknowledge(); closeSession(); clearIncidents(); setState({ storeCode: null, role: null }); go(''); }}>Leave store</button>
      </div>
    </main>
  );
}
