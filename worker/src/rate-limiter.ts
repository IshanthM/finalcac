import { DurableObject } from 'cloudflare:workers';

/** One instance per key (e.g. client IP): fixed-window counter persisted in storage. */
export class RateLimiter extends DurableObject {
  /** Returns true if the action is allowed (and counts it). */
  async allow(limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    const rec = (await this.ctx.storage.get<{ start: number; n: number }>('w')) ?? { start: now, n: 0 };
    if (now - rec.start >= windowMs) {
      rec.start = now;
      rec.n = 0;
    }
    if (rec.n >= limit) return false;
    rec.n++;
    await this.ctx.storage.put('w', rec);
    return true;
  }
}
