/** Where the relay lives. Override with ?relay=https://… (remembered) or at build time with VITE_RELAY_URL. */
const KEY = 'resonance.relay';

export function relayBase(): string {
  try {
    const q = new URLSearchParams(location.search).get('relay');
    if (q && /^https?:\/\//.test(q)) {
      localStorage.setItem(KEY, q.replace(/\/+$/, ''));
    }
    const saved = localStorage.getItem(KEY);
    if (saved) return saved;
  } catch { /* storage blocked */ }
  return (import.meta.env.VITE_RELAY_URL as string | undefined)?.replace(/\/+$/, '') ?? 'http://localhost:8787';
}

export const wsBase = (): string => relayBase().replace(/^http/, 'ws');

export async function createStore(): Promise<string> {
  const r = await fetch(`${relayBase()}/api/stores`, { method: 'POST' });
  const body = (await r.json().catch(() => ({}))) as { code?: string; error?: string };
  if (!r.ok || !body.code) throw new Error(body.error ?? `Could not create a store (${r.status})`);
  return body.code;
}

export async function storeExists(code: string): Promise<boolean> {
  const r = await fetch(`${relayBase()}/api/stores/${code}`);
  if (r.status === 404) return false;
  if (!r.ok) throw new Error(`Relay error ${r.status}`);
  return true;
}

/** Normalise what a person types: uppercase, drop spaces/dashes, map look-alikes (O→0 is not valid, so O is rejected). */
export function normalizeCode(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}
export const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
