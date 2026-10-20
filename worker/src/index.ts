import { StoreRoom } from './store-room.ts';
import { RateLimiter } from './rate-limiter.ts';
import { CODE_ALPHABET, CODE_RE } from './protocol.ts';

export { StoreRoom, RateLimiter };

interface Env {
  STORE: DurableObjectNamespace<StoreRoom>;
  LIMITER: DurableObjectNamespace<RateLimiter>;
  ALLOWED_ORIGINS: string;
  /** Store creations allowed per IP per hour (default 10). */
  CREATE_LIMIT?: string;
}

const DEFAULT_CREATE_LIMIT = 10;
const CREATE_WINDOW_MS = 3_600_000;

function originAllowed(origin: string | null, env: Env): boolean {
  if (!origin) return true; // non-browser clients (scripts); cross-site abuse needs a browser Origin
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).includes(origin);
}

function cors(origin: string | null): HeadersInit {
  return origin
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
    : {};
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
}

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (!originAllowed(origin, env)) return new Response('Forbidden origin', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    if (url.pathname === '/api/health') return json({ ok: true }, 200, origin);

    if (url.pathname === '/api/stores' && request.method === 'POST') {
      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
      const limiter = env.LIMITER.get(env.LIMITER.idFromName(`create:${ip}`));
      if (!(await limiter.allow(Number(env.CREATE_LIMIT) || DEFAULT_CREATE_LIMIT, CREATE_WINDOW_MS))) return json({ error: 'Too many stores created from this network. Try again later.' }, 429, origin);
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newCode();
        const stub = env.STORE.get(env.STORE.idFromName(code));
        if (await stub.create()) return json({ code }, 201, origin);
      }
      return json({ error: 'Could not allocate a store code' }, 503, origin);
    }

    const m = url.pathname.match(/^\/api\/stores\/([A-Z0-9]{6})(?:\/(ws|events|summary))?$/);
    if (m) {
      const code = m[1]!;
      if (!CODE_RE.test(code)) return json({ error: 'Bad store code' }, 400, origin);
      const stub = env.STORE.get(env.STORE.idFromName(code));
      if (!(await stub.exists())) return json({ error: 'Unknown store code' }, 404, origin);
      const sub = m[2];
      if (!sub) return json({ code, exists: true }, 200, origin);
      if (sub === 'ws') return stub.fetch(request);
      if (sub === 'events') {
        const limit = Number(url.searchParams.get('limit') ?? 100);
        return json({ events: await stub.events(Number.isFinite(limit) ? limit : 100) }, 200, origin);
      }
      return json(await stub.summary(), 200, origin);
    }
    return json({ error: 'Not found' }, 404, origin);
  },
} satisfies ExportedHandler<Env>;
