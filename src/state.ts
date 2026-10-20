/** Small persisted app state (role, store, zone, tag profile) with a subscribe/hook API. localStorage is optional. */
import { useEffect, useState } from 'preact/hooks';
import { parseProfile, type TagProfile } from './dsp/profile.ts';

export type Role = 'listener' | 'staff' | 'demo';
export type ZoneType = 'fitting' | 'floor' | 'register';

export const ZONE_TYPE_LABEL: Record<ZoneType, string> = { fitting: 'Fitting room', floor: 'Floor', register: 'Register' };

export interface Zone {
  name: string;
  type: ZoneType;
}

export interface AppState {
  role: Role | null;
  storeCode: string | null;
  zone: Zone | null;
  profile: TagProfile | null;
}

const KEY = 'resonance.state.v1';
const EMPTY: AppState = { role: null, storeCode: null, zone: null, profile: null };

function load(): AppState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<AppState> | null;
    if (!raw) return { ...EMPTY };
    const zone = raw.zone && typeof raw.zone.name === 'string' && ['fitting', 'floor', 'register'].includes(raw.zone.type)
      ? { name: raw.zone.name.slice(0, 40), type: raw.zone.type } : null;
    return {
      role: raw.role === 'listener' || raw.role === 'staff' || raw.role === 'demo' ? raw.role : null,
      storeCode: typeof raw.storeCode === 'string' && /^[A-Z0-9]{6}$/.test(raw.storeCode) ? raw.storeCode : null,
      zone,
      profile: parseProfile(raw.profile),
    };
  } catch {
    return { ...EMPTY };
  }
}

let state: AppState = load();
const subs = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: keep in memory */ }
  for (const fn of subs) fn();
}

export function useAppState(): AppState {
  const [, set] = useState(0);
  useEffect(() => {
    const fn = (): void => set((n) => n + 1);
    subs.add(fn);
    return () => { subs.delete(fn); };
  }, []);
  return state;
}

/** Hash router: '#/calibrate' → 'calibrate', '' → ''. */
export function useRoute(): string {
  const [route, set] = useState(() => location.hash.replace(/^#\/?/, ''));
  useEffect(() => {
    const fn = (): void => set(location.hash.replace(/^#\/?/, ''));
    addEventListener('hashchange', fn);
    return () => removeEventListener('hashchange', fn);
  }, []);
  return route;
}

export function go(route: string): void {
  location.hash = `#/${route}`;
}

/** Back one step, or home if this page was opened directly. */
export function goBack(): void {
  if (history.length > 1) history.back();
  else go('');
}
