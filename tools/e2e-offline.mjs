// The app shell must load with no network after one visit. node tools/e2e-offline.mjs [appBase]
import { open } from './e2e-lib.mjs';
const base = process.argv[2] ?? 'http://localhost:4173/';
const { browser, ctx, page } = await open(base, null, {});
await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
await page.waitForTimeout(1500);
await ctx.setOffline(true);
await page.goto(`${base}#/about`);
await page.reload();
const ok = await page.waitForSelector('h1.large', { timeout: 5000 }).then(() => true).catch(() => false);
const text = ok ? await page.innerText('main') : '';
console.log(ok && /how it works|tag|zone/i.test(text) ? 'PASS  app reloads offline after one visit' : `FAIL  offline reload: ${text.slice(0, 80)}`);
await browser.close();
process.exit(ok ? 0 : 1);
