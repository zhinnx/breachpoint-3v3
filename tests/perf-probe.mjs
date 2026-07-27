import puppeteer from 'puppeteer';
import { preview } from 'vite';
const server = await preview({ preview: { port: 4192, host: '127.0.0.1' }, logLevel: 'error' });
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--enable-webgl','--ignore-gpu-blocklist','--disable-dev-shm-usage','--window-size=1280,720'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('console', m => { if (m.type()==='error') console.log('ERR', m.text().slice(0,160)); });
await page.goto('http://127.0.0.1:4192/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.lobby', { timeout: 45000 });
await page.click('.play-btn');
await page.waitForSelector('.hud', { timeout: 30000 });
console.log('hud up');
await page.waitForSelector('.buymenu', { timeout: 40000 }).catch(()=>console.log('no buymenu'));
await page.keyboard.press('KeyB');

for (let i=0;i<8;i++){
  await new Promise(r=>setTimeout(r,4000));
  const st = await page.evaluate(() => {
    const s = window.__BP_STORE__.getState();
    const gl = window.__BP_GL__ ? window.__BP_GL__.gl : null;
    return { phase: s.phase, t: +s.phaseTime.toFixed(1), round: s.round,
             calls: gl?gl.info.render.calls:null, tris: gl?gl.info.render.triangles:null,
             frame: gl?gl.info.render.frame:null };
  });
  console.log(`t+${(i+1)*4}s`, JSON.stringify(st));
}
// measure fps
const fps = await page.evaluate(() => new Promise(res=>{let f=0;const t0=performance.now();
 const tick=()=>{f++; if(performance.now()-t0<4000) requestAnimationFrame(tick); else res(+(f*1000/(performance.now()-t0)).toFixed(1));};
 requestAnimationFrame(tick);}));
console.log('measured fps:', fps);
await browser.close(); await server.close();
