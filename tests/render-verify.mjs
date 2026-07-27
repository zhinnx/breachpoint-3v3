import puppeteer from 'puppeteer';
import { preview } from 'vite';
const server = await preview({ preview: { port: 4195, host: '127.0.0.1' }, logLevel: 'error' });
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--enable-webgl','--ignore-gpu-blocklist','--disable-dev-shm-usage','--window-size=640,360'] });
const page = await browser.newPage();
await page.setViewport({ width: 640, height: 360 });
await page.goto('http://127.0.0.1:4195/', { waitUntil:'domcontentloaded', timeout:60000 });
await page.waitForSelector('.lobby', { timeout: 45000 });
await page.evaluate(() => window.__BP_STORE__.getState().setSetting('quality','low'));
await page.click('.play-btn');
await page.waitForSelector('.hud', { timeout: 30000 });
await new Promise(r=>setTimeout(r,6000));

// Instrument BOTH render passes by wrapping renderer.render for one frame.
const res = await page.evaluate(() => new Promise(resolve => {
  const gl = window.__BP_GL__.gl;
  const orig = gl.render.bind(gl);
  const passes = [];
  gl.render = function(scene, cam) {
    const before = gl.info.render.calls;
    orig(scene, cam);
    passes.push({ scene: scene.type + (scene.children.length ? `(${scene.children.length} kids)` : ''),
                  calls: gl.info.render.calls - before,
                  tris: gl.info.render.triangles });
  };
  requestAnimationFrame(() => requestAnimationFrame(() => {
    gl.render = orig;
    resolve(passes);
  }));
}));
console.log('render passes in one frame:', JSON.stringify(res, null, 1));

// Hide overlay + sample the centre of the framebuffer
await page.addStyleTag({ content: '.click-to-play,.death-overlay,.hurt-vignette,.buymenu,.phase-hint{display:none!important}' });
await page.evaluate(() => window.__BP_STORE__.getState().toggleBuyMenu(false));
await page.evaluate(() => {
  const st=window.__BP_STORE__; const s=st.getState();
  st.getState().patchEntity(s.playerId,{alive:true,hp:100});
  const a=window.__BP_WORLD__.actors[s.playerId];
  a.pos=[0,0,-14]; a.yaw=0; a.pitch=0.05;
});
await new Promise(r=>setTimeout(r,5000));
await page.screenshot({ path:'tests/shot-verify.png' });
// second angle: left lane
await page.evaluate(() => { const s=window.__BP_STORE__.getState();
  const a=window.__BP_WORLD__.actors[s.playerId]; a.pos=[-17,0,-6]; a.yaw=0.2; a.pitch=0.0; });
await new Promise(r=>setTimeout(r,5000));
await page.screenshot({ path:'tests/shot-verify2.png' });
console.log('screenshots saved');
await browser.close(); await server.close();
