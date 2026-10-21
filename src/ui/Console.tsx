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
import { Bezel } from './Bezel.tsx';
import { Icon } from './Icon.tsx';
import { Reveal } from './Reveal.tsx';

const FRESH_MS = 2 * 60 * 1000;
const hz = (v: number): string => Math.round(v).toLocaleString('en-US');

function ZoneMap({ zones, alarming }: { zones: ZoneInfo[]; alarming: Set<string> }) {
  if (zones.length === 0) return <div class="empty"><span class="tile-ico"><Icon name="mic" /></span><strong>No listeners yet</strong><span>On another phone, choose Listener and enter this store's code.</span></div>;
  return (
    <ul class="zones" aria-label="Zones">
      {zones.map((z) => {
        const alarm = alarming.has(z.name);
        return (
          <li key={z.name} class={`zone ${alarm ? 'alarm' : z.online ? 'online' : 'offline'}`}>
            <span class="zone-name">{z.name}</span>
            <span class="zone-meta">{z.type === 'register' ? 'Register' : z.type === 'fitting' ? 'Fitting room' : 'Floor'}</span>
            <span class="zone-status">{alarm ? 'Tamper' : z.online ? 'Listening' : 'Offline'}</span>
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
  const [copied, setCopied] = useState(false);
  const copyCode = async (): Promise<void> => {
    try { await navigator.clipboard.writeText(code ?? ''); } catch { /* clipboard blocked: the code is still on screen */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
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

  if (!code) return <main class="page narrow"><h1>No store joined</h1><button class="btn btn-primary" onClick={() => go('join/staff')}>Open the console</button></main>;

  const arm = (): void => { unlockOutputs(); void keepAwake(); setArmed(true); };
  const alarming = new Set(alarms.map((a) => a.zone));
  const profile = s.profile;
  return (
    <main class="page">
      <AlertOverlay onAck={(id) => sendAck(id)} />
      <Reveal as="h1">Staff console</Reveal>
      <div class="cols two">
        <div class="sticky stack">
          <Reveal>
            <Bezel tone="tan" class="code-card" aria-label="Store code">
              <span class="eyebrow">Store code</span>
              <strong class="code-big" aria-label={`Store code ${code.split('').join(' ')}`}>{code}</strong>
              <span class="muted">Enter this on each listener phone.</span>
              <button class={`code-copy ${copied ? 'done' : ''}`} onClick={() => void copyCode()} aria-label={`Copy store code ${code}`}>
                <span class="swap"><Icon name="copy" cls={copied ? 'off' : ''} /><Icon name="check" cls={copied ? '' : 'off'} /></span>
                <span aria-hidden="true">{copied ? 'Copied' : 'Copy code'}</span>
              </button>
              <span class="sr-only" role="status" aria-live="polite">{copied ? 'Store code copied' : ''}</span>
            </Bezel>
          </Reveal>
          <Reveal i={1}>
            <p class={`chip ${status === 'open' ? 'ok' : 'warnchip'}`} role="status" aria-live="polite">
              {status === 'open' ? 'Connected' : status === 'connecting' ? 'Connecting' : 'Offline, reconnecting'}
            </p>
          </Reveal>
          {!armed && (
            <Reveal i={2}>
              <Bezel tone="amber" aria-label="Enable alerts">
                <h2 class="warn">Enable alerts</h2>
                <p>Tap once so this phone can play the siren and speak alerts, then keep this screen open.</p>
                <button class="btn btn-primary" onClick={arm}>Enable alerts</button>
              </Bezel>
            </Reveal>
          )}
          <Reveal i={3}>
            <Bezel>
              <h3>Tag profile</h3>
              {profile
                ? <p class="muted"><span class="mono">{hz(profile.freqHz)} Hz</span>, accepts <span class="mono">±{(toleranceFrac(profile.spreadFrac) * 100).toFixed(2)}%</span>. Calibrated {new Date(profile.calibratedAt).toLocaleDateString()}.</p>
                : <p class="muted">Not calibrated yet. Calibrate a tag on this phone or on any listener.</p>}
              <div class="actions">
                <button class="btn" onClick={() => go('calibrate')}>{profile ? 'Recalibrate' : 'Calibrate tag'}</button>
                <a class="btn" href={`${import.meta.env.BASE_URL}dashboard.html?store=${code}`}>Dashboard</a>
              </div>
            </Bezel>
          </Reveal>
          <button class="btn btn-quiet" onClick={() => { acknowledge(); closeSession(); clearIncidents(); setState({ storeCode: null, role: null }); go(''); }}>Leave store</button>
        </div>
        <div>
          <Reveal as="h2" style={{ marginTop: '0' }}>Zones</Reveal>
          <Reveal i={1}><ZoneMap zones={zones} alarming={alarming} /></Reveal>
          <Reveal as="h2">Event log</Reveal>
          <Reveal i={1}><EventLog items={incidents} /></Reveal>
        </div>
      </div>
    </main>
  );
}
