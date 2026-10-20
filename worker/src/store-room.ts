import { DurableObject } from 'cloudflare:workers';
import { Deduper, type Effect, type Incident, type Report } from '../../src/dsp/dedupe.ts';
import { parseProfile, type TagProfile } from '../../src/dsp/profile.ts';
import {
  MAX_MESSAGE_BYTES, MAX_SOCKETS_PER_STORE, cleanZoneName, isZoneKind, parseClientMsg,
  type Role, type ServerMsg, type ZoneInfo, type ZoneKind,
} from './protocol.ts';

interface Env { STORE: DurableObjectNamespace; LIMITER: DurableObjectNamespace }

interface Attachment { role: Role; zone: string | null; zoneType: ZoneKind | null }

const MAX_EVENTS_KEPT = 1000;
const DETECT_PER_SOCKET_PER_SEC = 5;
const DETECT_PER_STORE_PER_MIN = 120;

/** One store: sockets, tag profile, zones, event log, dedupe. State is SQLite, so it survives hibernation. */
export class StoreRoom extends DurableObject<Env> {
  private deduper = new Deduper();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private socketBuckets = new WeakMap<WebSocket, { windowStart: number; n: number }>();
  private storeWindow = { start: 0, n: 0 };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const sql = ctx.storage.sql;
      sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
      sql.exec('CREATE TABLE IF NOT EXISTS zones (name TEXT PRIMARY KEY, type TEXT NOT NULL, last_seen INTEGER NOT NULL)');
      sql.exec(`CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY, at INTEGER NOT NULL, zone TEXT NOT NULL, zone_type TEXT NOT NULL, kind TEXT NOT NULL,
        snr REAL NOT NULL, freq REAL NOT NULL, also TEXT NOT NULL, delayed INTEGER NOT NULL, test INTEGER NOT NULL, acked_at INTEGER)`);
      sql.exec('CREATE INDEX IF NOT EXISTS events_at ON events (at DESC)');
    });
  }

  // ---- RPC from the Worker -------------------------------------------------------------------------

  /** Creates the store; false if it already exists. */
  create(): boolean {
    if (this.getMeta('created')) return false;
    this.setMeta('created', String(Date.now()));
    return true;
  }

  exists(): boolean {
    return this.getMeta('created') !== null;
  }

  events(limit: number): Incident[] {
    return this.recentIncidents(Math.max(1, Math.min(500, Math.floor(limit))));
  }

  summary(): { profile: TagProfile | null; zones: ZoneInfo[]; incidents: Incident[] } {
    return { profile: this.getProfile(), zones: this.zoneInfos(), incidents: this.recentIncidents(50) };
  }

  // ---- WebSocket ------------------------------------------------------------------------------------

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
    if (!this.exists()) return new Response('Unknown store', { status: 404 });
    const url = new URL(request.url);
    const role = url.searchParams.get('role');
    if (role !== 'listener' && role !== 'console') return new Response('Bad role', { status: 400 });
    let zone: string | null = null;
    let zoneType: ZoneKind | null = null;
    if (role === 'listener') {
      zone = cleanZoneName(url.searchParams.get('zone'));
      const t = url.searchParams.get('type');
      if (!zone || !isZoneKind(t)) return new Response('Listener needs zone and type', { status: 400 });
      zoneType = t;
    }
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS_PER_STORE) return new Response('Store is full', { status: 503 });

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    const att: Attachment = { role, zone, zoneType };
    server.serializeAttachment(att);
    if (zone && zoneType) this.touchZone(zone, zoneType);
    this.send(server, { t: 'state', ...this.summary(), consoles: this.consoleCount(), now: Date.now() });
    this.broadcastZones();
    return new Response(null, { status: 101, webSocket: client });
  }

  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_BYTES) {
      this.send(ws, { t: 'error', msg: 'message too large or not text' });
      if (typeof message !== 'string' || message.length > MAX_MESSAGE_BYTES * 4) ws.close(1009, 'too large');
      return;
    }
    let parsed: unknown;
    try { parsed = JSON.parse(message); } catch { this.send(ws, { t: 'error', msg: 'bad json' }); return; }
    const msg = parseClientMsg(parsed, parseProfile);
    if (!msg) { this.send(ws, { t: 'error', msg: 'bad message' }); return; }
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) { ws.close(1011, 'no attachment'); return; }

    switch (msg.t) {
      case 'ping':
        this.send(ws, { t: 'pong' });
        return;
      case 'profile':
        this.setMeta('profile', JSON.stringify(msg.profile));
        this.broadcast({ t: 'profile', profile: msg.profile });
        return;
      case 'ack': {
        if (att.role !== 'console') { this.send(ws, { t: 'error', msg: 'only a console can acknowledge' }); return; }
        const at = Date.now();
        this.ctx.storage.sql.exec('UPDATE events SET acked_at = ? WHERE id = ? AND acked_at IS NULL', at, msg.id);
        this.broadcast({ t: 'ack', id: msg.id, at });
        return;
      }
      case 'detect': {
        if (att.role !== 'listener' || !att.zone || !att.zoneType) { this.send(ws, { t: 'error', msg: 'only a listener can report' }); return; }
        if (!this.allowDetect(ws)) { this.send(ws, { t: 'error', msg: 'rate limited' }); return; }
        this.touchZone(att.zone, att.zoneType);
        const report: Report = {
          zone: att.zone, zoneType: att.zoneType, snrDb: msg.snr, freqHz: msg.freq,
          ...(msg.delayed ? { delayed: true } : {}), ...(msg.test ? { test: true } : {}),
        };
        this.apply(this.deduper.report(report, Date.now()));
        this.schedule();
        return;
      }
    }
  }

  override webSocketClose(ws: WebSocket, code: number): void {
    try { ws.close(code === 1005 ? 1000 : code); } catch { /* already closed */ }
    this.broadcastZones();
  }

  override webSocketError(ws: WebSocket): void {
    try { ws.close(1011, 'error'); } catch { /* already closed */ }
    this.broadcastZones();
  }

  // ---- incidents ------------------------------------------------------------------------------------

  private schedule(): void {
    if (this.timer) return;
    const due = this.deduper.nextDeadline();
    if (due === null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.apply(this.deduper.tick(Date.now()));
      this.schedule();
    }, Math.max(0, due - Date.now()) + 5);
  }

  private apply(effects: Effect[]): void {
    for (const fx of effects) {
      this.saveIncident(fx.incident);
      this.broadcast({ t: fx.type, incident: fx.incident });
    }
  }

  private saveIncident(i: Incident): void {
    const sql = this.ctx.storage.sql;
    sql.exec(
      `INSERT INTO events (id, at, zone, zone_type, kind, snr, freq, also, delayed, test, acked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET also = excluded.also`,
      i.id, i.at, i.zone, i.zoneType, i.kind, i.snrDb, i.freqHz, JSON.stringify(i.alsoHeardBy), i.delayed ? 1 : 0, i.test ? 1 : 0, i.ackedAt ?? null,
    );
    sql.exec('DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY at DESC LIMIT ?)', MAX_EVENTS_KEPT);
  }

  private recentIncidents(limit: number): Incident[] {
    const rows = this.ctx.storage.sql.exec('SELECT * FROM events ORDER BY at DESC LIMIT ?', limit).toArray();
    return rows.map((r) => ({
      id: String(r.id), at: Number(r.at), zone: String(r.zone), zoneType: r.zone_type as ZoneKind, kind: r.kind as 'tamper' | 'checkout',
      snrDb: Number(r.snr), freqHz: Number(r.freq), alsoHeardBy: JSON.parse(String(r.also)) as Incident['alsoHeardBy'],
      ...(r.delayed ? { delayed: true } : {}), ...(r.test ? { test: true } : {}), ...(r.acked_at != null ? { ackedAt: Number(r.acked_at) } : {}),
    }));
  }

  // ---- zones, profile, meta -------------------------------------------------------------------------

  private touchZone(name: string, type: ZoneKind): void {
    this.ctx.storage.sql.exec(
      'INSERT INTO zones (name, type, last_seen) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET type = excluded.type, last_seen = excluded.last_seen',
      name, type, Date.now(),
    );
  }

  private zoneInfos(): ZoneInfo[] {
    const online = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a?.role === 'listener' && a.zone) online.add(a.zone);
    }
    return this.ctx.storage.sql.exec('SELECT name, type, last_seen FROM zones ORDER BY name').toArray().map((r) => ({
      name: String(r.name), type: r.type as ZoneKind, online: online.has(String(r.name)), lastSeen: Number(r.last_seen),
    }));
  }

  private getProfile(): TagProfile | null {
    const raw = this.getMeta('profile');
    if (!raw) return null;
    try { return parseProfile(JSON.parse(raw)); } catch { return null; }
  }

  private getMeta(k: string): string | null {
    const row = this.ctx.storage.sql.exec('SELECT v FROM meta WHERE k = ?', k).toArray()[0];
    return row ? String(row.v) : null;
  }

  private setMeta(k: string, v: string): void {
    this.ctx.storage.sql.exec('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, v);
  }

  // ---- limits and sending ---------------------------------------------------------------------------

  private allowDetect(ws: WebSocket): boolean {
    const now = Date.now();
    const b = this.socketBuckets.get(ws) ?? { windowStart: now, n: 0 };
    if (now - b.windowStart >= 1000) { b.windowStart = now; b.n = 0; }
    this.socketBuckets.set(ws, b);
    if (b.n >= DETECT_PER_SOCKET_PER_SEC) return false;
    if (now - this.storeWindow.start >= 60_000) this.storeWindow = { start: now, n: 0 };
    if (this.storeWindow.n >= DETECT_PER_STORE_PER_MIN) return false;
    b.n++;
    this.storeWindow.n++;
    return true;
  }

  private send(ws: WebSocket, msg: ServerMsg): void {
    try { ws.send(JSON.stringify(msg)); } catch { /* socket gone */ }
  }

  private broadcast(msg: ServerMsg): void {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(text); } catch { /* socket gone */ }
    }
  }

  private broadcastZones(): void {
    this.broadcast({ t: 'zones', zones: this.zoneInfos(), consoles: this.consoleCount() });
  }

  private consoleCount(): number {
    let n = 0;
    for (const ws of this.ctx.getWebSockets()) {
      if ((ws.deserializeAttachment() as Attachment | null)?.role === 'console') n++;
    }
    return n;
  }
}
