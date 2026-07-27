import puppeteer from 'puppeteer';
import { preview } from 'vite';
const server = await preview({ preview: { port: 4194, host: '127.0.0.1' }, logLevel: 'error' });
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--enable-webgl','--ignore-gpu-blocklist','--disable-dev-shm-usage','--window-size=800,450'] });
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 450 });   // fewer pixels for the software rasterizer
await page.goto('http://127.0.0.1:4194/', { waitUntil:'domcontentloaded', timeout:60000 });
await page.waitForSelector('.lobby', { timeout: 45000 });
// force LOW quality before entering the match
await page.evaluate(() => window.__BP_STORE__.getState().setSetting('quality','low'));
await page.click('.play-btn');
await page.waitForSelector('.hud', { timeout: 30000 });
await new Promise(r=>setTimeout(r,8000));
const fps = await page.evaluate(() => new Promise(res=>{let f=0;const t0=performance.now();
 const tick=()=>{f++; if(performance.now()-t0<5000) requestAnimationFrame(tick); else res(+(f*1000/(performance.now()-t0)).toFixed(1));};
 requestAnimationFrame(tick);}));
const info = await page.evaluate(() => { const gl=window.__BP_GL__.gl; return { calls: gl.info.render.calls, tris: gl.info.render.triangles, dpr: window.devicePixelRatio, w: gl.domElement.width, h: gl.domElement.height, shadows: gl.shadowMap.enabled }; });
console.log('LOW quality @800x450 fps:', fps, JSON.stringify(info));
await browser.close(); await server.close();
