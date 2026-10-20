/**
 * Multi-listener dedupe and the register rule. Pure: no timers, no DOM; the caller supplies `now`.
 * Used by the demo hub (one phone) and by the relay's Durable Object, so both behave identically.
 *
 * - A report opens a group. For `collectMs` more reports join it; then ONE incident goes out, attributed to the
 *   zone with the highest SNR, with the rest listed as "also heard by".
 * - Reports that arrive after the incident went out but within `windowMs` of the first are added to "also heard by"
 *   (an update); they never change the attribution, so staff are not told one zone and then another.
 * - If the attributed zone is a Register, the incident is a quiet "checkout" instead of a tamper alarm.
 */
import { PARAMS } from './params.ts';

export type ZoneKind = 'fitting' | 'floor' | 'register';

export interface Report {
  /** Zone name as shown to staff, e.g. "Fitting Room 2". */
  zone: string;
  zoneType: ZoneKind;
  snrDb: number;
  freqHz: number;
  /** True if the listener queued this while offline. */
  delayed?: boolean;
  /** True for a button-press test, not a real detection. */
  test?: boolean;
}

export interface HeardBy {
  zone: string;
  snrDb: number;
}

export interface Incident {
  id: string;
  /** Epoch ms of the first report in the group. */
  at: number;
  zone: string;
  zoneType: ZoneKind;
  snrDb: number;
  freqHz: number;
  kind: 'tamper' | 'checkout';
  alsoHeardBy: HeardBy[];
  delayed?: boolean;
  test?: boolean;
  ackedAt?: number;
}

export type Effect = { type: 'incident'; incident: Incident } | { type: 'update'; incident: Incident };

interface Group {
  firstAt: number;
  reports: Report[];
  emitted: Incident | null;
}

export interface DedupeOptions {
  collectMs?: number;
  windowMs?: number;
  /** Id generator (injectable for tests). */
  makeId?: () => string;
}

/** The rule: a register-zone event is a checkout, anything else a tamper. */
export function kindFor(zoneType: ZoneKind): 'tamper' | 'checkout' {
  return zoneType === 'register' ? 'checkout' : 'tamper';
}

export class Deduper {
  private readonly collectMs: number;
  private readonly windowMs: number;
  private readonly makeId: () => string;
  private groups: Group[] = [];
  private counter = 0;

  constructor(opts: DedupeOptions = {}) {
    this.collectMs = opts.collectMs ?? PARAMS.dedupeCollectMs;
    this.windowMs = opts.windowMs ?? PARAMS.dedupeWindowMs;
    this.makeId = opts.makeId ?? ((): string => `${Date.now().toString(36)}-${(this.counter++).toString(36)}`);
  }

  /** Add a report received at `now`. Returns effects that are due immediately (late additions to an emitted incident). */
  report(r: Report, now: number): Effect[] {
    this.prune(now);
    const group = this.groups.find((g) => now - g.firstAt < this.windowMs);
    if (!group) {
      this.groups.push({ firstAt: now, reports: [r], emitted: null });
      return [];
    }
    if (!group.emitted) {
      group.reports.push(r);
      return [];
    }
    // Late report: only extend "also heard by".
    const inc = group.emitted;
    if (r.zone !== inc.zone && !inc.alsoHeardBy.some((h) => h.zone === r.zone)) {
      inc.alsoHeardBy = [...inc.alsoHeardBy, { zone: r.zone, snrDb: r.snrDb }].sort((a, b) => b.snrDb - a.snrDb);
      return [{ type: 'update', incident: { ...inc } }];
    }
    return [];
  }

  /** Emit incidents whose collect window has elapsed. Call at least every ~50 ms while `nextDeadline()` is non-null. */
  tick(now: number): Effect[] {
    const out: Effect[] = [];
    for (const g of this.groups) {
      if (!g.emitted && now - g.firstAt >= this.collectMs) {
        g.emitted = this.build(g);
        out.push({ type: 'incident', incident: { ...g.emitted } });
      }
    }
    this.prune(now);
    return out;
  }

  /** Epoch ms when the next group needs a tick, or null if nothing is pending. */
  nextDeadline(): number | null {
    let best: number | null = null;
    for (const g of this.groups) {
      if (!g.emitted) {
        const t = g.firstAt + this.collectMs;
        if (best === null || t < best) best = t;
      }
    }
    return best;
  }

  private build(g: Group): Incident {
    // Highest SNR wins; ties go to the earliest report. Same zone reported twice keeps its best SNR.
    const byZone = new Map<string, Report>();
    for (const r of g.reports) {
      const cur = byZone.get(r.zone);
      if (!cur || r.snrDb > cur.snrDb) byZone.set(r.zone, r);
    }
    const ranked = [...byZone.values()].sort((a, b) => b.snrDb - a.snrDb);
    const top = ranked[0]!;
    return {
      id: this.makeId(),
      at: g.firstAt,
      zone: top.zone,
      zoneType: top.zoneType,
      snrDb: top.snrDb,
      freqHz: top.freqHz,
      kind: kindFor(top.zoneType),
      alsoHeardBy: ranked.slice(1).map((r) => ({ zone: r.zone, snrDb: r.snrDb })),
      ...(top.delayed ? { delayed: true } : {}),
      ...(top.test ? { test: true } : {}),
    };
  }

  private prune(now: number): void {
    this.groups = this.groups.filter((g) => !g.emitted || now - g.firstAt < this.windowMs);
  }
}
