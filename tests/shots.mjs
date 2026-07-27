/**
 * Visual capture: drops the camera at several vantage points around Steelfall
 * and screenshots gameplay so lighting/geometry can be eyeballed.
 */
import puppeteer from 'puppeteer';
import { preview } from 'vite';

const server = await preview({ preview: { port: 4189, host: '127.0.0.1' }, logLevel: 'error' });
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
    '--disable-dev-shm-usage', '--window-size=1280,720'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text().slice(0, 200)); });

await page.goto('http://127.0.0.1:4189/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.lobby', { timeout: 45000 });
await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: 'tests/shot-lobby.png' });
console.log('captured lobby');

await page.click('.play-btn');
await page.waitForSelector('.hud', { timeout: 30000 });
await page.waitForSelector('.buymenu', { timeout: 40000 });
// buy a rifle so the viewmodel shows a primary
await page.evaluate(() => {
  const t = [...document.querySelectorAll('.bm-item')].find((el) => el.textContent.includes('Vanguard-7'));
  if (t) t.click();
});
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: 'tests/shot-buymenu.png' });
console.log('captured buy menu');

await page.keyboard.press('KeyB');
await page.evaluate(() => window.__BP_STORE__.getState().toggleBuyMenu(false));
await page.waitForFunction(() => !!document.querySelector('.crosshair'), { timeout: 45000, polling: 400 });
console.log('combat reached');

// Headless can't acquire pointer lock, so the "CLICK TO ENGAGE" scrim would
// darken every frame. Hide it (and death/vignette overlays) for clean captures.
await page.addStyleTag({ content: `
  .click-to-play, .death-overlay, .hurt-vignette, .phase-hint, .buymenu { display: none !important; }
` });
// Keep the player alive + topped up while we tour the map.
await page.evaluate(() => {
  const st = window.__BP_STORE__;
  setInterval(() => {
    const s = st.getState();
    const p = s.entities[s.playerId];
    if (p) s.patchEntity(s.playerId, { alive: true, hp: 100 });
  }, 250);
});

// Teleport the player around the map for representative shots.
const views = [
  { name: 'mid-floor', pos: [0, 0, -19], yaw: 0, pitch: -0.02 },
  { name: 'tower-look', pos: [0, 0, -11], yaw: 0, pitch: 0.16 },
  { name: 'left-lane', pos: [-17.5, 0, -8], yaw: 0, pitch: 0 },
  { name: 'right-lane', pos: [16.5, 0, -12], yaw: 0.15, pitch: 0.02 },
  { name: 'tower-L2', pos: [0, 3.4, 0], yaw: Math.PI, pitch: -0.12 },
  { name: 'spawn-blue', pos: [0, 0, -27], yaw: 0, pitch: 0 },
];

for (const v of views) {
  await page.evaluate((vv) => {
    const w = window.__BP_WORLD__;
    const pid = window.__BP_STORE__.getState().playerId;
    const a = w.actors[pid];
    if (!a) return;
    a.pos = [...vv.pos];
    a.vel = [0, 0, 0];
    a.yaw = vv.yaw;
    a.pitch = vv.pitch;
  }, v);
  await new Promise((r) => setTimeout(r, 5000));
  await page.screenshot({ path: `tests/shot-${v.name}.png` });
  console.log('captured', v.name);
}

// ADS shot with the sniper
await page.evaluate(() => {
  const st = window.__BP_STORE__.getState();
  st.buyWeapon(st.playerId, 'vantage50');
});
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => {
  const w = window.__BP_WORLD__;
  const pid = window.__BP_STORE__.getState().playerId;
  const a = w.actors[pid];
  a.pos = [0, 0, -19]; a.yaw = 0; a.pitch = 0; a.ads = 1; a.wantAds = true;
});
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: 'tests/shot-sniper-ads.png' });
console.log('captured sniper ADS');

await browser.close();
await server.close();
console.log('done');
