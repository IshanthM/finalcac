/** Wire protocol shared by the relay and the app (types only, plus validators for untrusted input). */
import type { Incident } from '../../src/dsp/dedupe.ts';
import type { TagProfile } from '../../src/dsp/profile.ts';

export type Role = 'listener' | 'console';
export type ZoneKind = 'fitting' | 'floor' | 'register';

export interface ZoneInfo {
  name: string;
  type: ZoneKind;
  online: boolean;
  lastSeen: number;
}

/** Client → server. */
export type ClientMsg =
  | { t: 'detect'; snr: number; freq: number; delayed?: boolean; test?: boolean }
  | { t: 'ack'; id: string }
  | { t: 'profile'; profile: TagProfile }
  | { t: 'ping' };

/** Server → client. */
export type ServerMsg =
  | { t: 'state'; profile: TagProfile | null; zones: ZoneInfo[]; consoles: number; incidents: Incident[]; now: number }
  | { t: 'incident'; incident: Incident }
  | { t: 'update'; incident: Incident }
  | { t: 'ack'; id: string; at: number }
  | { t: 'profile'; profile: TagProfile }
  | { t: 'zones'; zones: ZoneInfo[]; consoles: number }
  | { t: 'error'; msg: string }
  | { t: 'pong' };

export const MAX_MESSAGE_BYTES = 2048;
export const MAX_SOCKETS_PER_STORE = 20;

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

export function cleanZoneName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40);
  return s.length > 0 ? s : null;
}

export function isZoneKind(v: unknown): v is ZoneKind {
  return v === 'fitting' || v === 'floor' || v === 'register';
}

const finite = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** Validate a parsed client message; null if malformed. */
export function parseClientMsg(raw: unknown, parseProfile: (r: unknown) => TagProfile | null): ClientMsg | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  switch (m.t) {
    case 'ping':
      return { t: 'ping' };
    case 'detect':
      if (!finite(m.snr, -50, 120) || !finite(m.freq, 5000, 24000)) return null;
      return { t: 'detect', snr: m.snr, freq: m.freq, ...(m.delayed === true ? { delayed: true } : {}), ...(m.test === true ? { test: true } : {}) };
    case 'ack':
      return typeof m.id === 'string' && m.id.length > 0 && m.id.length <= 40 ? { t: 'ack', id: m.id } : null;
    case 'profile': {
      const p = parseProfile(m.profile);
      return p ? { t: 'profile', profile: p } : null;
    }
    default:
      return null;
  }
}
