/**
 * Responsive + mobile-playability gate.
 *
 * Emulates real devices with touch enabled, then asserts the things that
 * actually decide whether the game is playable on a phone:
 *   - touch controls mount, and every control clears the 44px target floor
 *   - the virtual stick genuinely writes movement into the simulation
 *   - no horizontal scroll at any width from 320 to 1920
 *   - no clickable label wraps to two lines
 *   - the squad strip collapses instead of printing full callsigns
 *   - HUD elements do not overlap the thumb clusters
 */
import puppeteer from 'puppeteer';
import { preview } from 'vite';

const server = await preview({ preview: { port: 4196, host: '127.0.0.1' }, logLevel: 'error' });
const URL = 'http://127.0.0.1:4196/';

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
    '--disable-dev-shm-usage'],
});

let fails = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log(`   PASS  ${name}${extra ? ` — ${extra}` : ''}`);
  else { console.log(`   FAIL  ${name} ${extra}`); fails++; }
};

const DEVICES = [
  { name: 'iPhone SE portrait',  w: 320, h: 568, touch: true },
  { name: 'iPhone 12 portrait',  w: 390, h: 844, touch: true },
  { name: 'iPhone 12 landscape', w: 844, h: 390, touch: true },
  { name: 'Pixel 7 landscape',   w: 915, h: 412, touch: true },
  { name: 'iPad portrait',       w: 768, h: 1024, touch: true },
  { name: 'Desktop 1280x800',    w: 1280, h: 800, touch: false },
  { name: 'Desktop 1920x1080',   w: 1920, h: 1080, touch: false },
];

console.log('\n=== BREACHPOINT responsive + mobile gate ===');

for (const d of DEVICES) {
  console.log(`\n--- ${d.name} (${d.w}x${d.h}${d.touch ? ', touch' : ''}) ---`);
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  await page.emulate({
    viewport: { width: d.w, height: d.h, isMobile: d.touch, hasTouch: d.touch, deviceScaleFactor: 2 },
    userAgent: d.touch
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.lobby', { timeout: 45000 }).catch(() => {});

  // ---- lobby: no horizontal scroll, PLAY reachable, no wrapped labels
  const lobby = await page.evaluate(() => {
    const doc = document.documentElement;
    const play = document.querySelector('.play-btn');
    const pr = play?.getBoundingClientRect();
    // a control whose text wraps has a box taller than ~1.6 lines of its own font
    const wrapped = [];
    for (const el of document.querySelectorAll('.btn, .mode-tab .mt-name, .pb-label, .close-btn, .buy-tabs button')) {
      const cs = getComputedStyle(el);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      const r = el.getBoundingClientRect();
      const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      if (r.height - pad > lh * 1.75 && el.textContent.trim()) wrapped.push(el.textContent.trim().slice(0, 22));
    }
    return {
      scrollW: doc.scrollWidth,
      clientW: doc.clientWidth,
      playVisible: !!pr && pr.top >= 0 && pr.bottom <= window.innerHeight + 1 && pr.width > 0,
      playH: pr ? Math.round(pr.height) : 0,
      wrapped,
    };
  });
  check('lobby: no horizontal scroll', lobby.scrollW <= lobby.clientW + 1,
    `${lobby.scrollW} vs ${lobby.clientW}`);
  check('lobby: PLAY fully on-screen', lobby.playVisible, `h=${lobby.playH}px`);
  check('lobby: no wrapped control labels', lobby.wrapped.length === 0, lobby.wrapped.join(' | '));

  // ---- enter a match
  await page.click('.play-btn');
  await page.waitForSelector('.hud', { timeout: 30000 }).catch(() => {});
  await page.waitForSelector('.buymenu, .buy', { timeout: 40000 }).catch(() => {});

  const touchPresent = await page.evaluate(() => !!document.querySelector('.touch-layer'));
  check(`touch layer ${d.touch ? 'mounted' : 'absent'}`, touchPresent === d.touch);

  // Touch controls only mount during COMBAT (they are hidden in the buy phase
  // by design), so advance the phase before asserting on them.
  await page.evaluate(() => {
    const st = window.__BP_STORE__?.getState();
    st?.toggleBuyMenu(false);
    st?.beginCombat();
  });
  await new Promise((r) => setTimeout(r, 900));

  const hud = await page.evaluate(() => {
    const doc = document.documentElement;
    const box = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
    const overlap = (a, b) => !!a && !!b && !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
    const vitals = box('.vitals');
    const ammo = box('.ammo');
    const stick = box('.stick');
    const fire = box('.tbtn-fire');
    const mini = box('.minimap');
    // Readouts must clear EVERY touch control, not just the fire button.
    const collide = [];
    for (const btn of document.querySelectorAll('.tbtn, .util-dock, .touch-sys, .stick')) {
      const r = btn.getBoundingClientRect();
      for (const [nm, rr] of [['vitals', vitals], ['ammo', ammo], ['hud-top', box('.hud-top')],
                              ['squad', box('.squad')], ['minimap', mini]]) {
        if (!rr) continue;
        if (!(r.right < rr.left || r.left > rr.right || r.bottom < rr.top || r.top > rr.bottom)) {
          collide.push(`${nm} x ${btn.className.split(' ').filter(c => c.startsWith('tbtn-') || c === 'util-dock' || c === 'touch-sys' || c === 'stick')[0] || 'btn'}`);
        }
      }
    }
    const squadNames = [...document.querySelectorAll('.sq-name')]
      .filter((n) => getComputedStyle(n).display !== 'none').length;
    const small = [];
    for (const el of document.querySelectorAll('.tbtn, .touch-sys button')) {
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) small.push(`${el.className.split(' ')[1] || 'btn'} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    const offscreen = [];
    for (const sel of ['.vitals', '.ammo', '.hud-top', '.minimap', '.tbtn-fire', '.squad']) {
      const r = box(sel);
      if (!r) continue;
      if (r.left < -2 || r.top < -2 || r.right > window.innerWidth + 2 || r.bottom > window.innerHeight + 2) {
        offscreen.push(`${sel} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.right)}x${Math.round(r.bottom)}`);
      }
    }
    return {
      scrollW: doc.scrollWidth, clientW: doc.clientWidth,
      vitalsVsStick: overlap(vitals, stick),
      ammoVsFire: overlap(ammo, fire),
      miniVsHudTop: overlap(mini, box('.hud-top')),
      squadNames, small, offscreen, collide: [...new Set(collide)],
    };
  });

  check('match: no horizontal scroll', hud.scrollW <= hud.clientW + 1, `${hud.scrollW} vs ${hud.clientW}`);
  check('match: all HUD inside viewport', hud.offscreen.length === 0, hud.offscreen.join(' | '));
  check('match: minimap clear of timer', !hud.miniVsHudTop);
  if (d.touch) {
    check('touch: every control >= 44px', hud.small.length === 0, hud.small.join(', '));
    check('touch: vitals clear of stick', !hud.vitalsVsStick);
    check('touch: ammo clear of fire button', !hud.ammoVsFire);
    check('touch: no readout under any control', hud.collide.length === 0, hud.collide.join(' | '));
    check('touch: squad shows pips not callsigns', hud.squadNames === 0, `${hud.squadNames} names visible`);

    // Real touch injection through CDP. Synthetic PointerEvents do not trigger
    // setPointerCapture, so they cannot exercise the drag path a finger uses.
    const cdp = await page.target().createCDPSession();
    const touch = (type, points) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    const boxOf = (sel) => page.evaluate((s2) => {
      const e = document.querySelector(s2);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height,
               l: r.left, t: r.top };
    }, sel);

    // --- virtual stick drives movement
    const sz = await boxOf('.stick-zone');
    let stickOk = false; let fwdVal = 'n/a';
    if (sz) {
      const sx = sz.l + sz.w * 0.4;
      const sy = sz.t + sz.h * 0.6;
      await touch('touchStart', [{ x: sx, y: sy, id: 1 }]);
      await new Promise((r) => setTimeout(r, 60));
      await touch('touchMove', [{ x: sx, y: sy - 60, id: 1 }]);
      await new Promise((r) => setTimeout(r, 80));
      const fwd = await page.evaluate(() => window.__BP_SIM__?.input.forward ?? 0);
      await touch('touchEnd', []);
      await new Promise((r) => setTimeout(r, 80));
      const rest = await page.evaluate(() => window.__BP_SIM__?.input.forward ?? 0);
      fwdVal = `${fwd.toFixed(2)} -> ${rest}`;
      stickOk = fwd > 0.4 && rest === 0;
    }
    check('touch: stick drives movement', stickOk, `forward ${fwdVal}`);

    // --- fire button
    const fb = await boxOf('.tbtn-fire');
    let fireOk = false; let fireVal = 'n/a';
    if (fb) {
      await touch('touchStart', [{ x: fb.x, y: fb.y, id: 2 }]);
      await new Promise((r) => setTimeout(r, 90));
      const on = await page.evaluate(() => window.__BP_SIM__?.input.fire);
      await touch('touchEnd', []);
      await new Promise((r) => setTimeout(r, 90));
      const off = await page.evaluate(() => window.__BP_SIM__?.input.fire);
      fireVal = `down=${on} up=${off}`;
      fireOk = on === true && off === false;
    }
    check('touch: fire button drives shooting', fireOk, fireVal);

    // --- look drag. The sim consumes mouseDelta and zeroes it every frame,
    // so assert on the resulting camera yaw rather than the transient buffer.
    const lz = await boxOf('.look-zone');
    let lookOk = false; let lookVal = 'n/a';
    if (lz) {
      const yaw0 = await page.evaluate(() => {
        const st = window.__BP_STORE__.getState();
        return window.__BP_WORLD__.actors[st.playerId]?.yaw ?? 0;
      });
      await touch('touchStart', [{ x: lz.x, y: lz.y, id: 3 }]);
      for (let i = 1; i <= 6; i++) {
        await touch('touchMove', [{ x: lz.x + i * 18, y: lz.y, id: 3 }]);
        await new Promise((r) => setTimeout(r, 35));
      }
      await touch('touchEnd', []);
      await new Promise((r) => setTimeout(r, 160));
      const yaw1 = await page.evaluate(() => {
        const st = window.__BP_STORE__.getState();
        return window.__BP_WORLD__.actors[st.playerId]?.yaw ?? 0;
      });
      const dy = Math.abs(yaw1 - yaw0);
      lookVal = `yaw ${yaw0.toFixed(3)} -> ${yaw1.toFixed(3)}`;
      lookOk = dy > 0.01;
    }
    check('touch: look drag rotates camera', lookOk, lookVal);
    await cdp.detach().catch(() => {});
  }

  const real = errs.filter((e) => !/favicon|DevTools|SwiftShader|Automatic fallback|GroupMarker/i.test(e));
  check('no console errors', real.length === 0, real.slice(0, 2).join(' | '));

  await page.close();
}

await browser.close();
await server.close();

console.log(`\n${fails === 0 ? 'RESPONSIVE GATE PASSED' : `${fails} RESPONSIVE FAILURE(S)`}\n`);
process.exit(fails ? 1 : 0);
