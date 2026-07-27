import { buildNavMesh, navStats, findPath, clampToNav, isOnNav } from '../src/game/navmesh.js';
import { SPAWNS, LEVEL, COVER_POINTS, LANE_PUSH_POINTS } from '../src/game/steelfall.js';

buildNavMesh();
console.log('navStats:', JSON.stringify(navStats()));

let fail = 0;
const t = (label, a, b, expect = true) => {
  const p = findPath(a, b);
  const ok = expect ? (p && p.length > 0) : !p;
  if (!ok) fail++;
  console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(32)} ${p ? p.length + ' wp' : 'null'}`);
  return p;
};

console.log('\nEXPORTED findPath (the API the AI actually uses):');
t('blue spawn -> red spawn', SPAWNS.BLUE[1].pos, SPAWNS.RED[1].pos);
t('mid -> mid across', [0, 0, -18], [0, 0, 18]);
t('left blue -> right red', [-18, 0, -18], [18, 0, 18]);
t('mid -> left lane', [0, 0, -18], [-18, 0, 0]);
t('ground -> tower L2', [0, 0, -20], [0, LEVEL.L2, 0]);
t('ground -> tower L3', [0, 0, -20], [0, LEVEL.L3, 0]);
t('ground -> right platform', [0, 0, -20], [16, LEVEL.L2, 0]);
t('right lane -> left lane', [18, 0, 6], [-18, 0, -6]);
t('spawn -> exact origin', SPAWNS.BLUE[0].pos, [0, 0, 0]);

console.log('\nEvery COVER_POINT reachable from both spawns:');
let unreachable = [];
for (const cp of COVER_POINTS) {
  const p1 = findPath(SPAWNS.BLUE[1].pos, cp.pos);
  const p2 = findPath(SPAWNS.RED[1].pos, cp.pos);
  if (!p1 || !p2) unreachable.push(cp.tag);
}
console.log(`  ${unreachable.length === 0 ? '✓' : '✗'} ${COVER_POINTS.length - unreachable.length}/${COVER_POINTS.length} reachable`
  + (unreachable.length ? ` — MISSING: ${unreachable.join(', ')}` : ''));
if (unreachable.length) fail++;

console.log('\nEvery LANE_PUSH_POINT reachable:');
let badPush = [];
for (const side of ['BLUE', 'RED']) {
  for (const lane of ['left', 'mid', 'right']) {
    for (const pt of LANE_PUSH_POINTS[side][lane]) {
      const p = findPath(SPAWNS[side][1].pos, pt);
      if (!p) badPush.push(`${side}/${lane}/${pt}`);
    }
  }
}
console.log(`  ${badPush.length === 0 ? '✓' : '✗'} ${badPush.length ? 'MISSING: ' + badPush.join(' | ') : 'all reachable'}`);
if (badPush.length) fail++;

console.log('\nRandom point stress (500 pairs):');
let nulls = 0;
for (let i = 0; i < 500; i++) {
  const a = [(Math.random() - 0.5) * 46, 0, (Math.random() - 0.5) * 56];
  const b = [(Math.random() - 0.5) * 46, 0, (Math.random() - 0.5) * 56];
  if (!findPath(a, b)) nulls++;
}
console.log(`  ${nulls === 0 ? '✓' : '✗'} ${500 - nulls}/500 resolved (${nulls} null)`);
if (nulls > 0) fail++;

console.log(`\n${fail === 0 ? '✅ NAV OK' : `❌ ${fail} nav failure(s)`}`);
