/** The active relay connection for this phone, shared by the screens so calibration can push the profile. */
import type { ServerMsg } from '../../worker/src/protocol.ts';
import type { TagProfile } from '../dsp/profile.ts';
import { RelayClient, type RelayStatus } from './relay.ts';
import type { Role } from '../../worker/src/protocol.ts';
import type { Zone } from '../state.ts';
import { useEffect, useState } from 'preact/hooks';

interface Session {
  client: RelayClient;
  key: string;
  consoles: number;
}

let current: Session | null = null;
let status: RelayStatus = 'idle';
const subs = new Set<() => void>();
const notify = (): void => subs.forEach((f) => f());

export function sessionKey(code: string, role: Role, zone: Zone | null | undefined): string {
  return `${code}|${role}|${zone?.name ?? ''}|${zone?.type ?? ''}`;
}

/** Open (or keep) the connection for this identity. Handlers are replaced on every call. */
export function openSession(opts: { code: string; role: Role; zone?: Zone | null; onMessage: (m: ServerMsg) => void }): RelayClient {
  const key = sessionKey(opts.code, opts.role, opts.zone);
  if (current && current.key !== key) closeSession();
  if (!current) {
    const client = new RelayClient({
      code: opts.code, role: opts.role, zone: opts.zone ?? null,
      onMessage: (m) => { if (m.t === 'state' || m.t === 'zones') if (current) current.consoles = m.consoles; handler?.(m); notify(); },
      onStatus: (s) => { status = s; notify(); },
    });
    current = { client, key, consoles: 0 };
    client.connect();
  }
  handler = opts.onMessage;
  return current.client;
}

let handler: ((m: ServerMsg) => void) | null = null;

export function closeSession(): void {
  current?.client.close();
  current = null;
  handler = null;
  status = 'idle';
  notify();
}

export function sessionStatus(): RelayStatus {
  return status;
}

export function consolesOnline(): number {
  return current?.consoles ?? 0;
}

export function pushProfile(profile: TagProfile): boolean {
  return current?.client.send({ t: 'profile', profile }) ?? false;
}

export function sendDetect(snr: number, freq: number, opts: { delayed?: boolean; test?: boolean } = {}): boolean {
  return current?.client.send({ t: 'detect', snr, freq, ...(opts.delayed ? { delayed: true } : {}), ...(opts.test ? { test: true } : {}) }) ?? false;
}

export function sendAck(id: string): boolean {
  return current?.client.send({ t: 'ack', id }) ?? false;
}

export function nudgeSession(): void {
  current?.client.nudge();
}

export function useSessionStatus(): RelayStatus {
  const [, set] = useState(0);
  useEffect(() => {
    const f = (): void => set((n) => n + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return status;
}
