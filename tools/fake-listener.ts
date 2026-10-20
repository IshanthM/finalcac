// A fake listener phone: connects to the relay and posts detections, so the console can be tested without phones.
//   npm run fake-listener -- --store ABC234 --zone "Fitting Room 2" --type fitting --snr 20 [--count 3] [--interval 2000]
//   npm run fake-listener -- --create --zone "Register 1" --type register     (creates a store first and prints its code)
// Options: --relay ws://localhost:8787 (default)  --freq 13300  --test  --hold  (stay connected after sending)
const args = process.argv.slice(2);
const opt = (name: string, def?: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1]!.startsWith('--') ? args[i + 1] : def;
};
const flag = (name: string): boolean => args.includes(`--${name}`);

const relay = opt('relay', 'ws://localhost:8787')!;
const http = relay.replace(/^ws/, 'http');
const zone = opt('zone', 'Fitting Room 2')!;
const type = opt('type', 'fitting')!;
const snr = Number(opt('snr', '20'));
const freq = Number(opt('freq', '13300'));
const count = Number(opt('count', '1'));
const interval = Number(opt('interval', '2000'));

let store = opt('store');
if (flag('create') || !store) {
  const r = await fetch(`${http}/api/stores`, { method: 'POST' });
  if (!r.ok) throw new Error(`create failed: ${r.status} ${await r.text()}`);
  store = ((await r.json()) as { code: string }).code;
  console.log(`created store ${store}`);
}

const ws = new WebSocket(`${relay}/api/stores/${store}/ws?role=listener&zone=${encodeURIComponent(zone)}&type=${type}`);
await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('connect failed')); });
ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.t === 'error') console.log('server error:', m.msg); if (m.t === 'ack') console.log('acknowledged', m.id); };
console.log(`connected as ${zone} (${type})`);
for (let i = 0; i < count; i++) {
  ws.send(JSON.stringify({ t: 'detect', snr, freq, ...(flag('test') ? { test: true } : {}) }));
  console.log(`sent detect ${i + 1}/${count} snr=${snr}`);
  if (i + 1 < count) await new Promise((r) => setTimeout(r, interval));
}
if (flag('hold')) { console.log('holding connection; Ctrl-C to stop'); await new Promise(() => {}); }
await new Promise((r) => setTimeout(r, 500));
ws.close();
