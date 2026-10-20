/** WebSocket client for the relay: reconnects with backoff, heartbeats, reports status. */
import type { ClientMsg, ServerMsg, Role } from '../../worker/src/protocol.ts';
import type { Zone } from '../state.ts';
import { wsBase } from './config.ts';

export type RelayStatus = 'idle' | 'connecting' | 'open' | 'offline';

export interface RelayOptions {
  code: string;
  role: Role;
  zone?: Zone | null;
  onMessage: (m: ServerMsg) => void;
  onStatus: (s: RelayStatus) => void;
}

const BACKOFF_MS = [1000, 2000, 4000, 8000, 10000];
const PING_EVERY_MS = 20000;
const DEAD_AFTER_MS = 50000;

export class RelayClient {
  status: RelayStatus = 'idle';
  private ws: WebSocket | null = null;
  private attempt = 0;
  private closed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeard = 0;

  private readonly opts: RelayOptions;

  constructor(opts: RelayOptions) {
    this.opts = opts;
  }

  connect(): void {
    this.closed = false;
    this.open();
  }

  private setStatus(s: RelayStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.opts.onStatus(s);
  }

  private open(): void {
    if (this.closed) return;
    this.setStatus(this.attempt === 0 ? 'connecting' : 'offline');
    const { code, role, zone } = this.opts;
    const qs = new URLSearchParams({ role });
    if (role === 'listener' && zone) { qs.set('zone', zone.name); qs.set('type', zone.type); }
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${wsBase()}/api/stores/${code}/ws?${qs.toString()}`);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.lastHeard = Date.now();
      this.setStatus('open');
      this.pingTimer = setInterval(() => this.heartbeat(), PING_EVERY_MS);
    };
    ws.onmessage = (e) => {
      this.lastHeard = Date.now();
      try { this.opts.onMessage(JSON.parse(String(e.data)) as ServerMsg); } catch { /* ignore malformed */ }
    };
    ws.onclose = () => this.dropped(ws);
    ws.onerror = () => { try { ws.close(); } catch { /* already closed */ } };
  }

  private heartbeat(): void {
    if (Date.now() - this.lastHeard > DEAD_AFTER_MS) {
      try { this.ws?.close(); } catch { /* already closed */ }
      return;
    }
    this.send({ t: 'ping' });
  }

  private dropped(ws: WebSocket): void {
    if (this.ws !== ws) return;
    this.ws = null;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    if (this.closed) { this.setStatus('idle'); return; }
    this.setStatus('offline');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return;
    const wait = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)]!;
    this.attempt++;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.open(); }, wait);
  }

  /** Reconnect now (e.g. the phone came back online). */
  nudge(): void {
    if (this.closed || this.status === 'open') return;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.open();
  }

  /** True if the message went out on an open socket. */
  send(msg: ClientMsg): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    try { this.ws.send(JSON.stringify(msg)); return true; } catch { return false; }
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.reconnectTimer = null;
    this.pingTimer = null;
    try { this.ws?.close(1000); } catch { /* already closed */ }
    this.ws = null;
    this.setStatus('idle');
  }
}
