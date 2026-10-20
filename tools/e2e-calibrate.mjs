// node tools/e2e-calibrate.mjs <calib|calib-outlier> [baseUrl]
import { open } from './e2e-lib.mjs';
const scenario = process.argv[2] ?? 'calib';
const base = process.argv[3] ?? 'http://localhost:4173/';
const { browser, page, errors } = await open(`${base}#/calibrate`, `.scratch/${scenario}.wav`);
await page.getByRole('button', { name: 'Start listening' }).click();
const want = scenario === 'calib' ? 'All 5 rings agree' : "The rings don't agree";
await page.waitForFunction((t) => document.body.innerText.includes(t), want, { timeout: 30000 });
console.log((await page.innerText('main')).split('\n').filter((l) => l.trim()).join('\n'));
if (scenario === 'calib') {
  await page.getByRole('button', { name: 'Save as store tag profile' }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('resonance.state.v1')).profile);
  console.log('saved profile:', JSON.stringify(saved));
}
await page.screenshot({ path: `.scratch/${scenario}.png`, fullPage: true });
console.log('errors:', errors);
await browser.close();
