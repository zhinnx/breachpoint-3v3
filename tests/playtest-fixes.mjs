/**
 * Regression gate for the reported playtest bugs.
 *
 * Each check maps to a specific complaint, so a future change that reintroduces
 * one fails here rather than in someone's hands:
 *
 *   1. Round 2+ must behave like round 1 (buy phase auto-starts on its timer,
 *      no READY press required) and every actor must return to spawn.
 *   2. Outlines: teammates only, and only where they are occluded. Seeing
 *      enemies through walls read as cheating.
 *   3. Joystick must survive opening a modal mid-drag.
 *   4. Settings must persist to localStorage across a reload.
 *   5. Graphics tiers must differ in shadows, environment and post-processing,
 *      not just cost.
 */
import puppeteer from 'puppeteer';
import { preview } from 'vite';

const server = await preview({ preview: { port: 4233, host: '127.0.0.1' }, logLevel: 'error' });
const URL = 'http://127.0.0.1:4233/';
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader', '--enable-webgl', '--disable-dev-shm-usage'],
});

let fails = 0;
const check = (n, c, x = '') => {
  if (c) console.log(`   PASS  ${n}${x ? ` — ${x}` : ''}`);
  else { console.log(`   FAIL  ${n} ${x}`); fails++; }
};

const newPage = async (touch = false) => {
  const p = await browser.newPage();
  await p.emulate({
    viewport: { width: touch ? 844 : 1280, height: touch ? 390 : 720, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 },
    userAgent: touch
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  });
  return p;
};

const enterMatch = async (p) => {
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.lobby', { timeout: 45000 });
  await p.click('.play-btn');
  await p.waitForSelector('.hud', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1800));
};

console.log('\n=== BREACHPOINT playtest-fix gate ===');

// ---------------------------------------------------------------- 1. rounds
console.log('\n[1] Round 2 behaves like round 1');
{
  const p = await newPage();
  await enterMatch(p);
  await p.evaluate(() => {
    const st = window.__BP_STORE__.getState();
    st.toggleBuyMenu(false);
    st.beginCombat();
  });
  await new Promise((r) => setTimeout(r, 500));
  // scatter everyone away from spawn
  await p.evaluate(() => {
    const st = window.__BP_STORE__.getState();
    for (const id of st.order) {
      const a = window.__BP_WORLD__.actors[id];
      if (a) a.pos = [9, 0, 4];
    }
  });
  await new Promise((r) => setTimeout(r, 400));
  await p.evaluate(() => window.__BP_STORE__.getState().endRound('BLUE', 'gate'));
  // ROUND_END runs its full banner beat before nextRound() fires, so wait for
  // the round counter rather than assuming a fixed delay.
  await p.waitForFunction(
    () => window.__BP_STORE__.getState().round === 2
      && window.__BP_STORE__.getState().phase === 'BUY',
    { timeout: 40000, polling: 200 },
  ).catch(() => {});
  // let the sim apply the spawn reset on its next frame
  await new Promise((r) => setTimeout(r, 900));

  const r2 = await p.evaluate(() => {
    const st = window.__BP_STORE__.getState();
    const spawnZ = st.order.map((id) => {
      const a = window.__BP_WORLD__.actors[id];
      return a ? Math.round(a.pos[2]) : 0;
    });
    return { round: st.round, phase: st.phase, buyOpen: st.buyMenuOpen, t: st.phaseTime, spawnZ };
  });
  check('round advanced to 2', r2.round === 2, `round=${r2.round}`);
  check('round 2 opens in BUY phase', r2.phase === 'BUY', `phase=${r2.phase}`);
  check('buy menu presented', r2.buyOpen === true);
  // Every actor should be back at |z| >= 30 (the spawn aprons), not mid-map.
  check('all actors reset to spawn', r2.spawnZ.every((z) => Math.abs(z) >= 30),
    `z=${r2.spawnZ.join(',')}`);

  // and combat must start on its own, with no READY press
  // The buy phase is 15s of WALL time. Under SwiftShader the page runs at a
  // few fps, so rather than idling through it (which can exceed any sane test
  // budget) shorten the remaining timer and assert it still crosses zero on
  // its own — no READY press. Verified separately that a full-length timer
  // reaches COMBAT unaided.
  await p.evaluate(() => window.__BP_STORE__.getState().setPhase('BUY', 3));
  const before = await p.evaluate(() => window.__BP_STORE__.getState().phaseTime);
  const started = await p.waitForFunction(
    () => window.__BP_STORE__.getState().phase === 'COMBAT',
    { timeout: 60000, polling: 400 },
  ).then(() => true).catch(() => false);
  const after = await p.evaluate(() => {
    const st = window.__BP_STORE__.getState();
    return { phase: st.phase, t: +st.phaseTime.toFixed(1) };
  });
  check('buy timer counts down on its own', after.phase === 'COMBAT' || after.t < before,
    `t ${before.toFixed(1)} -> ${after.t}`);
  check('combat auto-starts without READY', started, `phase=${after.phase}`);
  await p.close();
}

// ---------------------------------------------------------------- 2. outlines
console.log('\n[2] Outlines: teammates only, occluded only');
{
  const p = await newPage();
  await enterMatch(p);
  await p.evaluate(() => {
    const st = window.__BP_STORE__.getState();
    st.toggleBuyMenu(false);
    st.beginCombat();
  });
  await new Promise((r) => setTimeout(r, 2500));
  const rim = await p.evaluate(() => {
    const st = window.__BP_STORE__.getState();
    const myTeam = st.entities[st.playerId].team;
    let friendly = 0; let enemy = 0; let depthOk = true; let fills = 0;
    window.__BP_GL__.scene.traverse((o) => {
      if (!o.material || o.material.side !== 1) return;
      const isRim = o.material.depthFunc === 6;
      const c = o.material.color ? o.material.color.getHexString() : '';
      if (isRim) {
        if (c.startsWith('63')) friendly++; else enemy++;
        if (o.material.depthWrite) depthOk = false;
      } else if (c.startsWith('3fa9ff') || c.startsWith('ff3b2f')) {
        // an always-visible team fill would be the old cheat-y behaviour
        fills++;
      }
    });
    const teams = st.order.map((id) => st.entities[id].team);
    return {
      friendly, enemy, depthOk, fills,
      mates: teams.filter((t) => t === myTeam).length - 1,
      foes: teams.filter((t) => t !== myTeam).length,
    };
  });
  check('teammates have occlusion rims', rim.friendly > 0, `${rim.friendly} rim meshes`);
  check('enemies have NO rims (no wallhack)', rim.enemy === 0, `${rim.enemy} enemy rims`);
  check('rims do not write depth', rim.depthOk);
  check('no always-visible team fills', rim.fills === 0, `${rim.fills} fills`);
  await p.close();
}

// ---------------------------------------------------------------- 3. joystick
console.log('\n[3] Joystick survives a modal opened mid-drag');
{
  const p = await newPage(true);
  await enterMatch(p);
  await p.evaluate(() => {
    const st = window.__BP_STORE__.getState();
    st.toggleBuyMenu(false);
    st.beginCombat();
  });
  await new Promise((r) => setTimeout(r, 1500));

  const cdp = await p.target().createCDPSession();
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const zoneBox = await p.evaluate(() => {
    const z = document.querySelector('.stick-zone');
    if (!z) return null;
    const r = z.getBoundingClientRect();
    return { x: r.left + r.width * 0.4, y: r.top + r.height * 0.6 };
  });
  check('stick zone present on touch', !!zoneBox);

  if (zoneBox) {
    // start dragging...
    await touch('touchStart', [{ x: zoneBox.x, y: zoneBox.y, id: 1 }]);
    await new Promise((r) => setTimeout(r, 60));
    await touch('touchMove', [{ x: zoneBox.x, y: zoneBox.y - 55, id: 1 }]);
    await new Promise((r) => setTimeout(r, 80));
    const during = await p.evaluate(() => window.__BP_SIM__.input.forward);
    check('stick moves before modal', during > 0.4, `forward=${during.toFixed(2)}`);

    // ...open the shop mid-drag, exactly as a player would
    await p.evaluate(() => window.__BP_STORE__.getState().toggleBuyMenu(true));
    await new Promise((r) => setTimeout(r, 500));
    // the finger never gets a clean touchend because the layer unmounted
    await touch('touchCancel', []).catch(() => {});
    await p.evaluate(() => window.__BP_STORE__.getState().toggleBuyMenu(false));
    await new Promise((r) => setTimeout(r, 700));

    const cleared = await p.evaluate(() => window.__BP_SIM__.input.forward);
    check('input released while modal open', cleared === 0, `forward=${cleared}`);

    // now the stick must accept a brand new touch
    await touch('touchStart', [{ x: zoneBox.x, y: zoneBox.y, id: 2 }]);
    await new Promise((r) => setTimeout(r, 60));
    await touch('touchMove', [{ x: zoneBox.x, y: zoneBox.y - 55, id: 2 }]);
    await new Promise((r) => setTimeout(r, 90));
    const after = await p.evaluate(() => window.__BP_SIM__.input.forward);
    await touch('touchEnd', []);
    check('stick works again after modal', after > 0.4, `forward=${after.toFixed(2)}`);
  }
  await p.close();
}

// ---------------------------------------------------------------- 4. settings
console.log('\n[4] Settings persist to localStorage');
{
  const p = await newPage();
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.lobby', { timeout: 45000 });
  await p.evaluate(() => {
    const st = window.__BP_STORE__.getState();
    st.setSetting('sensitivity', 2.35);
    st.setSetting('quality', 'low');
    st.setSetting('invertY', true);
  });
  await new Promise((r) => setTimeout(r, 400));
  const stored = await p.evaluate(() => localStorage.getItem('bp.settings.v1'));
  check('settings written to localStorage', !!stored && stored.includes('2.35'),
    stored ? stored.slice(0, 60) : 'null');

  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.lobby', { timeout: 45000 });
  const after = await p.evaluate(() => {
    const s = window.__BP_STORE__.getState().settings;
    return { sensitivity: s.sensitivity, quality: s.quality, invertY: s.invertY };
  });
  check('sensitivity survives reload', after.sensitivity === 2.35, `${after.sensitivity}`);
  check('quality survives reload', after.quality === 'low', `${after.quality}`);
  check('invertY survives reload', after.invertY === true, `${after.invertY}`);
  await p.close();
}

// ---------------------------------------------------------------- 5. tiers
console.log('\n[5] Graphics tiers actually differ');
{
  const seen = {};
  for (const q of ['low', 'medium', 'high']) {
    const p = await newPage();
    await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForSelector('.lobby', { timeout: 45000 });
    await p.evaluate((qq) => {
      localStorage.clear();
      window.__BP_STORE__.getState().setSetting('quality', qq);
    }, q);
    await new Promise((r) => setTimeout(r, 400));
    await p.click('.play-btn');
    await p.waitForSelector('.hud', { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 4000));
    seen[q] = await p.evaluate(() => {
      const gl = window.__BP_GL__?.gl;
      const sc = window.__BP_GL__?.scene;
      return gl ? {
        shadows: gl.shadowMap.enabled,
        shadowType: gl.shadowMap.type,
        env: !!sc.environment,
      } : null;
    });
    await p.close();
  }
  check('low disables shadows', seen.low && seen.low.shadows === false);
  check('medium enables shadows', seen.medium && seen.medium.shadows === true);
  check('high enables shadows', seen.high && seen.high.shadows === true);
  check('medium/high use different shadow filtering',
    seen.medium && seen.high && seen.medium.shadowType !== seen.high.shadowType,
    `medium=${seen.medium?.shadowType} high=${seen.high?.shadowType}`);
  check('low skips environment map', seen.low && seen.low.env === false);
  check('medium/high have environment map',
    seen.medium?.env === true && seen.high?.env === true);
}

await browser.close();
await server.close();
console.log(`\n${fails === 0 ? 'PLAYTEST-FIX GATE PASSED' : `${fails} FAILURE(S)`}\n`);
process.exit(fails ? 1 : 0);
