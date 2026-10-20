/** In-device hub for demo mode: reports in → dedupe + register rule → incidents → alarm. Same Deduper the relay uses. */
import { raise, refresh } from '../alert/alarm.ts';
import { Deduper, type Effect, type Report } from '../dsp/dedupe.ts';
import { upsertIncident } from './incidents.ts';

export class LocalHub {
  private deduper = new Deduper();
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.apply(this.deduper.tick(Date.now())), 50);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  submit(r: Report): void {
    this.apply(this.deduper.report(r, Date.now()));
    this.apply(this.deduper.tick(Date.now()));
  }

  private apply(effects: Effect[]): void {
    for (const fx of effects) {
      upsertIncident(fx.incident);
      if (fx.type === 'incident') raise(fx.incident);
      else refresh(fx.incident);
    }
  }
}
