import puppeteer from 'puppeteer';
import { preview } from 'vite';
const server = await preview({ preview: { port: 4191, host: '127.0.0.1' }, logLevel: 'error' });
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--enable-webgl','--ignore-gpu-blocklist','--disable-dev-shm-usage','--window-size=1280,720'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto('http://127.0.0.1:4191/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.lobby', { timeout: 45000 });
await page.click('.play-btn');
await page.waitForSelector('.hud', { timeout: 30000 });
await page.waitForFunction(() => !!document.querySelector('.crosshair'), { timeout: 60000, polling: 400 });
await new Promise(r => setTimeout(r, 3000));

const info = await page.evaluate(() => {
  // find the R3F root store
  const cvs = document.querySelector('canvas');
  const keys = Object.keys(cvs).filter(k => k.startsWith('__react'));
  const r = window.__R3F_STATE__ || null;
  return { hasCanvas: !!cvs, reactKeys: keys.length, r3f: !!r };
});
console.log('probe0', JSON.stringify(info));

// Instrument via the exposed world + a hook we can add: count draw calls by wrapping render
const stats = await page.evaluate(() => {
  const h = window.__BP_GL__;
  if (!h) return { found: false };
  const { gl, scene } = h;
  const inst = [];
  scene.traverse(o => {
    if (o.isInstancedMesh) inst.push({ n: o.count, r: +o.boundingSphere.radius.toFixed(1),
      c: o.boundingSphere.center.toArray().map(v=>+v.toFixed(1)) });
  });
  return { found:true, renderCalls: gl.info.render.calls, triangles: gl.info.render.triangles,
           frame: gl.info.render.frame, instSample: inst.slice(0,5), instTotal: inst.length };
});
console.log(JSON.stringify(stats, null, 2));
await browser.close(); await server.close();
