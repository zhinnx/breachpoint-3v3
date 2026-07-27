import puppeteer from 'puppeteer';
import { preview } from 'vite';
const server = await preview({ preview: { port: 4193, host: '127.0.0.1' }, logLevel: 'error' });
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--enable-webgl','--ignore-gpu-blocklist','--disable-dev-shm-usage','--window-size=1280,720'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://127.0.0.1:4193/', { waitUntil:'domcontentloaded', timeout:60000 });
await page.waitForSelector('.lobby', { timeout: 45000 });
await page.click('.play-btn');
await page.waitForSelector('.hud', { timeout: 30000 });
await new Promise(r=>setTimeout(r,6000));

// Time each phase manually inside one rAF
const timing = await page.evaluate(() => new Promise(res => {
  const gl = window.__BP_GL__.gl, scene = window.__BP_GL__.scene;
  const sim = window.__BP_SIM__;
  const cam = scene.__cam || null;
  const out = {};
  requestAnimationFrame(() => {
    let t = performance.now();
    sim.update(1/60);
    out.simUpdate = +(performance.now()-t).toFixed(2);
    res(out);
  });
}));
console.log('sim.update ms:', JSON.stringify(timing));

// JS CPU profile of ~5s
await page.evaluate(() => { window.__profMark = true; });
const client = await page.target().createCDPSession();
await client.send('Profiler.enable');
await client.send('Profiler.setSamplingInterval', { interval: 200 });
await client.send('Profiler.start');
await new Promise(r=>setTimeout(r,6000));
const { profile } = await client.send('Profiler.stop');

const nodes = new Map();
for (const n of profile.nodes) nodes.set(n.id, n);
const self = new Map();
if (profile.samples) {
  const dt = [];
  for (let i=1;i<profile.timeDeltas.length;i++) dt.push(profile.timeDeltas[i]);
  for (let i=0;i<profile.samples.length;i++){
    const id = profile.samples[i];
    const d = profile.timeDeltas[i]||0;
    self.set(id,(self.get(id)||0)+d);
  }
}
const rows=[...self.entries()].map(([id,us])=>{
  const n=nodes.get(id); const cf=n?n.callFrame:{};
  return { fn: (cf.functionName||'(anon)'), url:(cf.url||'').split('/').pop(), line: cf.lineNumber, ms: us/1000 };
}).sort((a,b)=>b.ms-a.ms).slice(0,22);
console.log('\nTop self-time (ms over ~6s):');
for(const r of rows) console.log(`  ${r.ms.toFixed(0).padStart(6)}  ${r.fn.slice(0,42).padEnd(44)} ${r.url}:${r.line}`);
await browser.close(); await server.close();
