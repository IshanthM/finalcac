/**
 * Role runtime: everything that must keep running while the person moves between tabs.
 * Demo: a local hub. Listener: the relay connection, offline queue and local alarm. Staff: the relay as a console.
 * Screens are plain views over the stores this module fills.
 */
import { useEffect, useState } from 'preact/hooks';
import type { ServerMsg, ZoneInfo } from '../worker/src/protocol.ts';
import { acknowledge, raise, refresh } from './alert/alarm.ts';
import { chime } from './alert/siren.ts';
import { unlockOutputs } from './alert/unlock.ts';
import { engine } from './audio/engine.ts';
import { keepAwake } from './audio/wakeLock.ts';
import { kindFor, type Incident, type Report } from './dsp/dedupe.ts';
import { parseProfile } from './dsp/profile.ts';
import { LocalHub } from './hub/localHub.ts';
import { ackIncident, clearIncidents, setIncidents, upsertIncident } from './hub/incidents.ts';
import { attachReporter } from './hub/reporter.ts';
import { clearQueue, pushQueue, readQueue } from './net/offlineQueue.ts';
import { closeSession, consolesOnline, nudgeSession, openSession, pushProfile, sendAck, sendDetect, sessionStatus } from './net/session.ts';
import { getState, setState } from './state.ts';

const FRESH_MS = 2 * 60 * 1000;

interface RuntimeState { zones: ZoneInfo[]; armed: boolean }
let rt: RuntimeState = { zones: [], armed: false };
const subs = new Set<() => void>();
const set = (patch: Partial<RuntimeState>): void => { rt = { ...rt, ...patch }; subs.forEach((f) => f()); };

export function useRuntime(): RuntimeState {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = (): void => bump((n) => n + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return rt;
}

let key = '';
let cleanup: (() => void) | null = null;
let demoHub: LocalHub | null = null;

/** Wire the runtime for the current role. Idempotent: call whenever role, store or zone may have changed. */
export function syncRuntime(): void {
  const s = getState();
  const k = `${s.role}|${s.storeCode}|${s.zone?.name}|${s.zone?.type}`;
  if (k === key) return;
  cleanup?.();
  cleanup = null;
  key = k;
  engine.setProfile(s.profile);
  if (s.role === 'demo') cleanup = startDemo();
  else if (s.role === 'listener' && s.storeCode && s.zone) cleanup = startListener(s.storeCode);
  else if (s.role === 'staff' && s.storeCode) cleanup = startStaff(s.storeCode);
}

function startDemo(): () => void {
  const hub = new LocalHub();
  demoHub = hub;
  hub.start();
  engine.setMode('detect');
  const off = attachReporter(() => getState().zone, (r) => hub.submit(r));
  return () => { off(); hub.stop(); demoHub = null; };
}

function startListener(code: string): () => void {
  engine.setMode('detect');
  const zone = getState().zone!;
  const client = openSession({
    code, role: 'listener', zone,
    onMessage: (m: ServerMsg) => {
      switch (m.t) {
        case 'state': {
          set({ zones: m.zones });
          setIncidents(m.incidents);
          syncProfile(parseProfile(m.profile));
          break;
        }
        case 'zones': set({ zones: m.zones }); break;
        case 'profile': syncProfile(parseProfile(m.profile)); break;
        case 'incident': case 'update': upsertIncident(m.incident); break; // visible in Alerts; only staff get the siren
        case 'ack': ackIncident(m.id, m.at); acknowledge(m.id); break;
      }
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
  const off = attachReporter(() => getState().zone, (r) => handleReport(r));
  return () => {
    off(); clearInterval(timer);
    removeEventListener('online', online); document.removeEventListener('visibilitychange', online);
    closeSession(); clearIncidents(); set({ zones: [] });
  };
}

function startStaff(code: string): () => void {
  clearIncidents();
  openSession({
    code, role: 'console',
    onMessage: (m: ServerMsg) => {
      switch (m.t) {
        case 'state': {
          set({ zones: m.zones });
          setIncidents(m.incidents);
          syncProfile(parseProfile(m.profile));
          for (const i of m.incidents) if (i.kind === 'tamper' && !i.ackedAt && !i.test && m.now - i.at < FRESH_MS) raise(i);
          break;
        }
        case 'zones': set({ zones: m.zones }); break;
        case 'incident': upsertIncident(m.incident); raise(m.incident); break;
        case 'update': upsertIncident(m.incident); refresh(m.incident); break;
        case 'ack': ackIncident(m.id, m.at); acknowledge(m.id); break;
        case 'profile': syncProfile(parseProfile(m.profile)); break;
      }
    },
  });
  return () => { closeSession(); clearIncidents(); set({ zones: [], armed: false }); };
}

/** Adopt the store's tag profile when it is newer; share ours when the store has none. */
function syncProfile(remote: ReturnType<typeof parseProfile>): void {
  const local = getState().profile;
  if (remote && (!local || remote.calibratedAt > local.calibratedAt)) { setState({ profile: remote }); engine.setProfile(remote); }
  else if (!remote && local) pushProfile(local);
}

/** A listener heard a ring: report it, or alarm locally when staff cannot be reached. */
function handleReport(r: Report, test = false): void {
  const reachable = sessionStatus() === 'open' && consolesOnline() > 0; // read live: this runs from a long-lived subscription
  const sent = sendDetect(r.snrDb, r.freqHz, { test });
  if (!sent) pushQueue({ snr: r.snrDb, freq: r.freqHz, at: Date.now(), test });
  if (kindFor(r.zoneType) === 'checkout') {
    if (!sent) chime();
    return;
  }
  if (sent && reachable) return; // staff were alerted; stay quiet here
  const inc: Incident = {
    id: `local-${Date.now()}`, at: Date.now(), zone: r.zone, zoneType: r.zoneType, snrDb: r.snrDb, freqHz: r.freqHz,
    kind: 'tamper', alsoHeardBy: [], ...(test ? { test: true } : {}),
  };
  upsertIncident(inc);
  raise(inc);
}

// ---- actions used by screens ----

export function enableAlerts(): void { unlockOutputs(); void keepAwake(); set({ armed: true }); }

export function startListening(): void { unlockOutputs(); void keepAwake(); void engine.start(); }

/** Simulate a ring (demo and listener roles). `two` also has a second zone hear it, to show the merge. */
export function simulateRing(two = false): void {
  unlockOutputs();
  const s = getState();
  const zone = s.zone;
  if (!zone) return;
  const freq = s.profile?.freqHz ?? 13300;
  const base: Report = { zone: zone.name, zoneType: zone.type, snrDb: 24, freqHz: freq, test: true };
  if (s.role === 'demo' && demoHub) {
    demoHub.submit(base);
    if (two) demoHub.submit({ zone: 'Sales Floor', zoneType: 'floor', snrDb: 13, freqHz: freq, test: true });
  } else if (s.role === 'listener') {
    handleReport(base, true);
  }
}

export function acknowledgeAlert(id: string): void {
  if (getState().role === 'staff') sendAck(id);
}

export function leaveStore(): void {
  acknowledge();
  engine.stop();
  setState({ storeCode: null, role: null, zone: null });
  syncRuntime();
}

/** Pick a role. Demo starts instantly with a default zone. */
export function chooseRole(role: 'demo' | 'listener' | 'staff'): void {
  if (role === 'demo') setState({ role, zone: getState().zone ?? { name: 'Fitting Room 2', type: 'fitting' } });
  else setState({ role });
  syncRuntime();
}
