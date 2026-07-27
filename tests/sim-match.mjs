/**
 * Headless full-match simulation test.
 * Runs BREACHPOINT's game logic with no renderer to prove the whole loop works:
 * lobby start -> buy phase -> combat -> kills -> round end -> economy -> match end.
 */
import { useGame } from '../src/game/store.js';
import { Simulation } from '../src/game/simulation.js';
import { PHASE, MATCH, ECONOMY } from '../src/game/config.js';
import { buildNavMesh, navStats, findPath } from '../src/game/navmesh.js';
import { world } from '../src/game/world.js';
import { MAP_META, COVER_POINTS, SPAWNS } from '../src/game/steelfall.js';
import { hasLineOfSight, castWorld } from '../src/game/raycast.js';

let failures = 0;
const check = (name, cond, extra = '') => {
  if (cond) console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ''}`);
  else { console.log(`  ✗ FAIL: ${name} ${extra}`); failures++; }
};

console.log('\n=== BREACHPOINT headless match test ===\n');

// ---------------------------------------------------------------- navmesh
console.log('[1] NavMesh');
const t0 = Date.now();
buildNavMesh();
const ns = navStats();
check('navmesh built', ns.polys > 200, `${ns.polys} polys, ${ns.groups} groups, ${Date.now() - t0}ms`);
check('map colliders', MAP_META.solidCount > 100, `${MAP_META.solidCount} solids`);
check('cover points tagged', COVER_POINTS.length >= 30, `${COVER_POINTS.length} points`);

// path across the whole map (blue spawn -> red spawn)
const p = findPath([0, 0, -27], [0, 0, 27]);
check('cross-map path found', p && p.length > 3, p ? `${p.length} waypoints` : 'null');
// path up to the tower L3
const pUp = findPath([0, 0, -20], [0, 6.8, 0]);
check('path to tower deck', !!pUp, pUp ? `${pUp.length} waypoints` : 'null (vertical link)');
check('navmesh is one connected region', ns.components === 1, `${ns.components} components`);

// ---------------------------------------------------------------- raycasting
console.log('\n[2] Raycasting / LOS');
const midOpen = hasLineOfSight([0, 1.6, -20], [0, 1.6, -12]);
check('open mid has LOS', midOpen);
const throughWall = hasLineOfSight([-20, 1.6, 0], [20, 1.6, 0]);
check('lane divider blocks LOS', !throughWall);
const down = castWorld([0, 5, -20], [0, -1, 0], 10);
check('downward ray hits floor', down.hit && Math.abs(down.point[1]) < 0.2, `y=${down.point[1].toFixed(2)}`);

// ---------------------------------------------------------------- match
console.log('\n[3] Match simulation');
const store = useGame.getState();
store.startMatch('normal');

const S = () => useGame.getState();
check('match started', S().screen === 'match');
check('6 entities spawned', S().order.length === 6, `${S().order.length}`);
check('starting credits', S().entities[S().playerId].credits === ECONOMY.startingCredits,
  `${S().entities[S().playerId].credits}`);

const sim = new Simulation(null);
sim.store = new Proxy({}, {
  get(_, prop) {
    const st = useGame.getState();
    const v = st[prop];
    return typeof v === 'function' ? v.bind(st) : v;
  },
});
sim.init();
check('runtime actors created', world.actorList.length === 6, `${world.actorList.length}`);
check('bots have AI', world.actorList.filter((a) => a.ai).length === 5,
  `${world.actorList.filter((a) => a.ai).length} bots`);

// Give the player a rifle so the sim has a real fight
store.buyWeapon(S().playerId, 'vanguard7');
store.buyArmor(S().playerId, 'heavy');
store.buyUtility(S().playerId, 'frag');
check('player bought rifle', S().entities[S().playerId].loadout.primary === 'vanguard7');
check('credits deducted', S().entities[S().playerId].credits === 8000 - 2900 - 1000 - 400,
  `${S().entities[S().playerId].credits}`);

// ---- drive the match
const DT = 1 / 60;
let frames = 0;
const MAX_FRAMES = 60 * 60 * 22; // 22 simulated minutes ceiling
const phaseSeen = new Set();
const roundsSeen = new Set();
let botsMoved = 0;
let shotsFired = 0;
let deaths = 0;
const startPositions = world.actorList.map((a) => [...a.pos]);

// Make the player fight: simple bot-like autopilot so the match resolves.
const playerActor = () => world.actors[useGame.getState().playerId];

while (frames < MAX_FRAMES && S().screen === 'match') {
  const st = S();
  phaseSeen.add(st.phase);
  roundsSeen.add(st.round);

  // crude player autopilot during combat: walk forward and shoot at visible enemies
  const pa = playerActor();
  if (pa && pa.alive && (st.phase === PHASE.COMBAT || st.phase === PHASE.SUDDEN_DEATH)) {
    const foes = world.actorList.filter((a) => a.alive && a.team !== pa.team);
    let target = null;
    let best = 1e9;
    for (const f of foes) {
      const d = Math.hypot(f.pos[0] - pa.pos[0], f.pos[2] - pa.pos[2]);
      const eye = [pa.pos[0], pa.pos[1] + 1.6, pa.pos[2]];
      const tc = [f.pos[0], f.pos[1] + 1.1, f.pos[2]];
      if (d < best && hasLineOfSight(eye, tc)) { best = d; target = f; }
    }
    if (target) {
      const dx = target.pos[0] - pa.pos[0];
      const dz = target.pos[2] - pa.pos[2];
      const dy = (target.pos[1] + 1.1) - (pa.pos[1] + 1.6);
      pa.yaw = Math.atan2(-dx, -dz);
      pa.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      sim.input.fire = true;
      sim.input.forward = best > 12 ? 1 : 0;
    } else {
      sim.input.fire = false;
      sim.input.forward = 1;
      // wander toward enemy half
      pa.yaw = st.sidesSwapped ? Math.PI : 0;
    }
  } else {
    sim.input.fire = false;
    sim.input.forward = 0;
  }

  sim.update(DT);
  frames++;

  if (frames % 600 === 0) {
    const alive = world.actorList.filter((a) => a.alive).length;
    process.stdout.write(
      `\r    t=${(frames / 60).toFixed(0)}s round=${st.round} phase=${st.phase.padEnd(12)} `
      + `score=${st.score.BLUE}-${st.score.RED} alive=${alive}   `,
    );
  }
}
process.stdout.write('\n');

// movement check
for (let i = 0; i < world.actorList.length; i++) {
  const a = world.actorList[i];
  const d = Math.hypot(a.pos[0] - startPositions[i][0], a.pos[2] - startPositions[i][2]);
  if (d > 3) botsMoved++;
}

const final = S();
const allStats = final.order.map((id) => final.entities[id].stats);
const totalKills = allStats.reduce((s, x) => s + x.kills, 0);
const totalShots = allStats.reduce((s, x) => s + x.shotsFired, 0);
const totalDamage = allStats.reduce((s, x) => s + x.damage, 0);
const totalDeaths = allStats.reduce((s, x) => s + x.deaths, 0);

console.log(`\n    simulated ${(frames / 60).toFixed(1)}s of match time`);
check('reached buy phase', phaseSeen.has(PHASE.BUY));
check('reached combat phase', phaseSeen.has(PHASE.COMBAT));
check('reached round end', phaseSeen.has(PHASE.ROUND_END));
check('multiple rounds played', roundsSeen.size >= 2, `rounds: ${[...roundsSeen].join(',')}`);
check('actors navigated the map', botsMoved >= 5, `${botsMoved}/6 moved >3m`);
check('weapons fired', totalShots > 50, `${totalShots} shots`);
check('damage dealt', totalDamage > 100, `${Math.round(totalDamage)} dmg`);
check('kills registered', totalKills > 0, `${totalKills} kills`);
check('deaths registered', totalDeaths > 0, `${totalDeaths} deaths`);
check('match concluded', final.screen === 'summary' || final.phase === PHASE.MATCH_END,
  `screen=${final.screen} phase=${final.phase}`);
check('a team reached 4 wins or 7 rounds',
  final.score.BLUE >= MATCH.roundsToWin || final.score.RED >= MATCH.roundsToWin || final.round >= MATCH.maxRounds,
  `${final.score.BLUE}-${final.score.RED} in ${final.round} rounds`);
check('MVP computed', !!final.mvpId, final.mvpId ? final.entities[final.mvpId].name : '');
check('credits stayed in bounds',
  final.order.every((id) => final.entities[id].credits >= 0 && final.entities[id].credits <= ECONOMY.maxCredits));

// no actor fell out of the world
const oob = world.actorList.filter((a) => a.pos[1] < -2 || Math.abs(a.pos[0]) > 30 || Math.abs(a.pos[2]) > 35);
check('no actor escaped the map', oob.length === 0, oob.length ? JSON.stringify(oob.map((a) => a.pos)) : '');

console.log('\n[4] Final scoreboard');
for (const id of final.order) {
  const e = final.entities[id];
  const acc = e.stats.shotsFired ? ((e.stats.shotsHit / e.stats.shotsFired) * 100).toFixed(0) : '0';
  console.log(
    `    ${e.team.padEnd(4)} ${e.name.padEnd(9)} `
    + `K/D/A ${String(e.stats.kills).padStart(2)}/${String(e.stats.deaths).padStart(2)}/${String(e.stats.assists).padStart(2)}  `
    + `dmg ${String(Math.round(e.stats.damage)).padStart(4)}  acc ${acc.padStart(3)}%  `
    + `cr ${String(e.credits).padStart(5)}${id === final.playerId ? '  <- player' : ''}`,
  );
}

console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
