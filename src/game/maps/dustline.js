/**
 * BREACHPOINT — Map "Dustline" (combat map, daylight).
 *
 * Replaces the enclosed night foundry. Playtest feedback was that the old map
 * was too dark to see enemies and too cramped, so this one is:
 *   - OUTDOOR and lit by a midday sun (no roof over the play space)
 *   - larger: 68 x 76 metres of playable area vs 50 x 60
 *   - built from pale desert concrete and sun-bleached walls so operators
 *     read as dark silhouettes against bright ground
 *
 * Layout keeps the readable 3-lane shape:
 *   WEST  x[-34,-13]  walled compound, short sightlines, close-quarters
 *   MID   x[-13, 13]  open plaza + two-storey cargo platform, long sightlines
 *   EAST  x[ 13, 34]  container yard, stacked cover, mid-range duels
 */

export const MAP_NAME = 'Dustline';
export const PLAY = { minX: -34, maxX: 34, minZ: -38, maxZ: 38 };
export const WALL_H = 8.5;
export const LEVEL = { L1: 0, L2: 3.6, L3: 7.0 };
export const OUTDOOR = true;

const MAT_SURFACE = {
  sandFloor: 'concrete',
  gravel: 'gravel',
  plaster: 'concrete',
  concreteWall: 'concrete',
  metalDeck: 'metal',
  container: 'metal',
  crateWood: 'wood',
  machine: 'metal',
  pipe: 'metal',
  barrel: 'metal',
  railing: 'metal',
  canopy: 'metal',
  hazard: 'metal',
  stone: 'concrete',
};

export const brushes = [];
let _bid = 0;

function slab(x0, x1, y0, y1, z0, z1, mat, opts = {}) {
  const b = {
    id: `b${_bid++}`,
    c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    h: [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2],
    min: [x0, y0, z0],
    max: [x1, y1, z1],
    mat,
    surf: opts.surf || MAT_SURFACE[mat] || 'concrete',
    collide: opts.collide !== false,
    carve: opts.carve !== false,
    cover: !!opts.cover,
    lane: opts.lane || null,
  };
  brushes.push(b);
  return b;
}

function wallZ(z0, z1, thickness, x, gaps, y0, y1, mat, opts) {
  const segs = [];
  let cur = z0;
  for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (g0 > cur) segs.push([cur, g0]);
    cur = Math.max(cur, g1);
  }
  if (cur < z1) segs.push([cur, z1]);
  for (const [a, b] of segs) slab(x - thickness / 2, x + thickness / 2, y0, y1, a, b, mat, opts);
}

function wallX(x0, x1, thickness, z, gaps, y0, y1, mat, opts) {
  const segs = [];
  let cur = x0;
  for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (g0 > cur) segs.push([cur, g0]);
    cur = Math.max(cur, g1);
  }
  if (cur < x1) segs.push([cur, x1]);
  for (const [a, b] of segs) slab(a, b, y0, y1, z - thickness / 2, z + thickness / 2, mat, opts);
}

// ------------------------------------------------------------------ ground
slab(PLAY.minX - 2, PLAY.maxX + 2, -1, 0, PLAY.minZ - 2, PLAY.maxZ + 2, 'sandFloor', { carve: false });
// gravel patches for footstep variety
slab(-12, 12, -0.02, 0.03, -30, -16, 'gravel', { collide: false, carve: false });
slab(-12, 12, -0.02, 0.03, 16, 30, 'gravel', { collide: false, carve: false });
slab(16, 32, -0.02, 0.03, -8, 8, 'gravel', { collide: false, carve: false });

// ------------------------------------------------------------------ perimeter
slab(PLAY.minX - 2, PLAY.minX, 0, WALL_H, PLAY.minZ - 2, PLAY.maxZ + 2, 'plaster');
slab(PLAY.maxX, PLAY.maxX + 2, 0, WALL_H, PLAY.minZ - 2, PLAY.maxZ + 2, 'plaster');
slab(PLAY.minX - 2, PLAY.maxX + 2, 0, WALL_H, PLAY.minZ - 2, PLAY.minZ, 'plaster');
slab(PLAY.minX - 2, PLAY.maxX + 2, 0, WALL_H, PLAY.maxZ, PLAY.maxZ + 2, 'plaster');

// ------------------------------------------------------------------ spawns
const SPAWN_GAPS = [[-28, -20], [-5, 5], [20, 28]];
wallX(PLAY.minX, PLAY.maxX, 1.0, -30, SPAWN_GAPS, 0, WALL_H, 'concreteWall');
wallX(PLAY.minX, PLAY.maxX, 1.0, 30, SPAWN_GAPS, 0, WALL_H, 'concreteWall');

for (const s of [-1, 1]) {
  const z = 34 * s;
  slab(-33, -27, 0, 2.6, z - 2.5, z + 2.5, 'container', { cover: true });
  slab(27, 33, 0, 2.6, z - 2.5, z + 2.5, 'container', { cover: true });
  slab(-3, 3, 0, 1.0, z - 1.0 * s, z + 1.0 * s, 'crateWood', { cover: true });
  // shade canopy over spawn, keeps the silhouette but not the gloom
  slab(-14, 14, 5.2, 5.5, z - 4, z + 4, 'canopy', { carve: false });
}

// ------------------------------------------------------------------ lane walls
const DIVIDER_GAPS = [[-24, -18], [-3, 3], [18, 24]];
wallZ(-30, 30, 0.9, -13, DIVIDER_GAPS, 0, 5.6, 'plaster');
wallZ(-30, 30, 0.9, 13, DIVIDER_GAPS, 0, 5.6, 'plaster');

for (const x of [-13, 13]) {
  for (const [g0, g1] of DIVIDER_GAPS) {
    slab(x - 1.0, x + 1.0, 4.4, 5.0, g0 - 0.3, g1 + 0.3, 'metalDeck', { carve: false });
  }
}

// ==================================================================
//  MID — open plaza + two-storey cargo platform
// ==================================================================
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    slab(sx * 6 - 0.5, sx * 6 + 0.5, 0, 7.4, sz * 6 - 0.5, sz * 6 + 0.5, 'metalDeck', { cover: true, lane: 'mid' });
  }
}
// core block (ground-floor blocker)
slab(-3, 3, 0, 2.8, -3, 3, 'machine', { cover: true, lane: 'mid' });

// L2 deck
slab(-6.5, 6.5, 3.4, 3.6, -6.5, 6.5, 'metalDeck', { lane: 'mid' });
slab(-10.5, -6.5, 3.4, 3.6, -3.5, -1.0, 'metalDeck', { lane: 'mid' });
slab(6.5, 10.5, 3.4, 3.6, 1.0, 3.5, 'metalDeck', { lane: 'mid' });
// railings (gaps keep firing lines)
slab(-6.5, 6.5, 3.6, 4.6, -6.6, -6.4, 'railing', { carve: false, lane: 'mid' });
slab(-6.5, -2.0, 3.6, 4.6, 6.4, 6.6, 'railing', { carve: false, lane: 'mid' });
slab(2.0, 6.5, 3.6, 4.6, 6.4, 6.6, 'railing', { carve: false, lane: 'mid' });
slab(-6.6, -6.4, 3.6, 4.6, -6.5, -4.0, 'railing', { carve: false, lane: 'mid' });
slab(6.4, 6.6, 3.6, 4.6, -6.5, -2.0, 'railing', { carve: false, lane: 'mid' });
slab(6.4, 6.6, 3.6, 4.6, 4.0, 6.5, 'railing', { carve: false, lane: 'mid' });

// L3 overwatch deck
slab(-5, 6.5, 6.8, 7.0, -5, 5, 'metalDeck', { lane: 'mid' });
slab(-5, 6.5, 7.0, 7.9, -5.1, -4.9, 'railing', { carve: false, lane: 'mid' });
slab(-5, 6.5, 7.0, 7.9, 4.9, 5.1, 'railing', { carve: false, lane: 'mid' });
slab(-5.1, -4.9, 7.0, 7.9, -5, 5, 'railing', { carve: false, lane: 'mid' });
slab(-3, -1, 7.0, 8.1, -4.6, -3.8, 'container', { cover: true, lane: 'mid' });
slab(1.5, 3.5, 7.0, 8.1, 3.8, 4.6, 'container', { cover: true, lane: 'mid' });

// mid ground cover
const midCover = [
  [-12, -8, 1.3, -12, -9, 'crateWood'],
  [-12, -9.5, 2.6, 10, 13, 'container'],
  [8, 12, 1.3, 9, 12, 'crateWood'],
  [9.5, 12, 2.6, -13, -10, 'container'],
  [-4, 1, 1.15, -16, -14.5, 'concreteWall'],
  [-1, 4, 1.15, 14.5, 16, 'concreteWall'],
  [-11, -7, 1.7, -21, -19, 'machine'],
  [7, 11, 1.7, 19, 21, 'machine'],
  [-3.5, 3.5, 1.05, -25, -23.5, 'crateWood'],
  [-3.5, 3.5, 1.05, 23.5, 25, 'crateWood'],
  [-12, -9, 1.4, -6, -3, 'stone'],
  [9, 12, 1.4, 3, 6, 'stone'],
];
for (const [x0, x1, y1, z0, z1, mat] of midCover) {
  slab(x0, x1, 0, y1, z0, z1, mat, { cover: true, lane: 'mid' });
}
for (const [bx, bz] of [[-11, -4.5], [-10.2, -5.8], [11, 4.5], [10.2, 5.8], [-8, 22], [8, -22]]) {
  slab(bx - 0.45, bx + 0.45, 0, 1.2, bz - 0.45, bz + 0.45, 'barrel', { cover: true, lane: 'mid' });
}

// ==================================================================
//  WEST — walled compound
// ==================================================================
wallZ(-28, -9, 0.8, -23, [], 0, 4.6, 'plaster', { lane: 'west' });
wallZ(9, 28, 0.8, -23, [], 0, 4.6, 'plaster', { lane: 'west' });
slab(-33, -29, 0, 2.5, -4, 4, 'container', { cover: true, lane: 'west' });
slab(-21, -17, 0, 1.25, -2, 2, 'crateWood', { cover: true, lane: 'west' });
slab(-18, -15.5, 0, 2.3, -12, -9.5, 'machine', { cover: true, lane: 'west' });
slab(-18, -15.5, 0, 2.3, 9.5, 12, 'machine', { cover: true, lane: 'west' });
slab(-30, -26, 0, 1.2, -17, -15, 'crateWood', { cover: true, lane: 'west' });
slab(-30, -26, 0, 1.2, 15, 17, 'crateWood', { cover: true, lane: 'west' });
slab(-23, -19, 0, 2.0, -27, -25, 'container', { cover: true, lane: 'west' });
slab(-23, -19, 0, 2.0, 25, 27, 'container', { cover: true, lane: 'west' });
slab(-27, -24, 0, 1.5, -8, -6, 'stone', { cover: true, lane: 'west' });
slab(-27, -24, 0, 1.5, 6, 8, 'stone', { cover: true, lane: 'west' });
for (const [bx, bz] of [[-26, -8.5], [-25.2, -9.4], [-26, 8.5], [-25.2, 9.4], [-16, -21], [-16, 21]]) {
  slab(bx - 0.45, bx + 0.45, 0, 1.2, bz - 0.45, bz + 0.45, 'barrel', { cover: true, lane: 'west' });
}
// open-air shade sails, not a solid roof (map must stay bright)
for (const z of [-24, -12, 0, 12, 24]) {
  slab(-32, -15, 5.0, 5.2, z - 2, z + 2, 'canopy', { carve: false, lane: 'west' });
}

// ==================================================================
//  EAST — container yard
// ==================================================================
const eastCover = [
  [15, 19, 2.6, -27, -23, 'container'],
  [20, 24, 1.3, -25, -21, 'crateWood'],
  [26, 32, 2.6, -19, -15, 'container'],
  [15, 19, 1.15, -12, -9, 'concreteWall'],
  [23, 29, 1.3, -9, -6, 'crateWood'],
  [28, 33, 2.3, -2, 2, 'machine'],
  [15, 19, 1.15, 9, 12, 'concreteWall'],
  [23, 29, 1.3, 6, 9, 'crateWood'],
  [26, 32, 2.6, 15, 19, 'container'],
  [20, 24, 1.3, 21, 25, 'crateWood'],
  [15, 19, 2.6, 23, 27, 'container'],
  [20, 25, 2.6, -14, -11, 'container'],
  [20, 25, 2.6, 11, 14, 'container'],
];
for (const [x0, x1, y1, z0, z1, mat] of eastCover) {
  slab(x0, x1, 0, y1, z0, z1, mat, { cover: true, lane: 'east' });
}
for (const [bx, bz] of [[21, -16], [21.9, -15.1], [21, 16], [21.9, 15.1], [16.5, 0.5], [31, -24], [31, 24]]) {
  slab(bx - 0.45, bx + 0.45, 0, 1.2, bz - 0.45, bz + 0.45, 'barrel', { cover: true, lane: 'east' });
}
// catwalk from mid deck into the east yard
slab(10.5, 17, 3.4, 3.6, -1.5, 1.5, 'metalDeck', { lane: 'east' });
slab(10.5, 17, 3.6, 4.5, -1.65, -1.45, 'railing', { carve: false });
slab(10.5, 17, 3.6, 4.5, 1.45, 1.65, 'railing', { carve: false });
slab(17, 25, 3.4, 3.6, -4.5, 4.5, 'metalDeck', { lane: 'east' });
slab(17, 25, 3.6, 4.5, -4.65, -4.45, 'railing', { carve: false });
slab(17, 25, 3.6, 4.5, 4.45, 4.65, 'railing', { carve: false });
slab(24.8, 25, 3.6, 4.5, -4.5, 4.5, 'railing', { carve: false });
slab(19, 21, 3.6, 4.7, -4.5, -3.6, 'container', { cover: true, lane: 'east' });
for (const [px, pz] of [[17.8, -3.8], [17.8, 3.8], [24.2, -3.8], [24.2, 3.8], [11.6, 0]]) {
  slab(px - 0.3, px + 0.3, 0, 3.4, pz - 0.3, pz + 0.3, 'metalDeck', { lane: 'east' });
}

// ==================================================================
//  STAIRS
// ==================================================================
export const RAMPS = [];
function stairs({ x0, x1, zStart, zEnd, yStart, yEnd, steps = 14, mat = 'metalDeck' }) {
  const dz = (zEnd - zStart) / steps;
  const dy = (yEnd - yStart) / steps;
  for (let i = 0; i < steps; i++) {
    const za = zStart + dz * i;
    const zb = za + dz;
    const top = yStart + dy * (i + 1);
    slab(x0, x1, Math.min(yStart, yEnd) - 0.2, top, Math.min(za, zb), Math.max(za, zb), mat, { carve: false });
  }
  RAMPS.push({ x0, x1, zStart, zEnd, yStart, yEnd });
}
// ground -> L2 (west of the platform). Kept clear of any cover brush.
stairs({ x0: -10.5, x1: -7.4, zStart: 6.8, zEnd: -1.0, yStart: 0, yEnd: LEVEL.L2, steps: 16 });
// L2 -> L3 (east of the platform)
stairs({ x0: 7.4, x1: 10.5, zStart: -6.8, zEnd: 1.0, yStart: LEVEL.L2, yEnd: LEVEL.L3, steps: 16 });
// east platform -> ground
stairs({ x0: 19.5, x1: 22.5, zStart: 4.5, zEnd: 12, yStart: LEVEL.L2, yEnd: 0, steps: 16 });

// ==================================================================
//  LADDER
// ==================================================================
export const LADDERS = [
  { min: [-0.9, 0, 6.5], max: [0.9, LEVEL.L2 + 0.5, 7.6], top: [0, LEVEL.L2 + 0.1, 5.4], bottom: [0, 0, 8.2] },
];
slab(-0.85, -0.7, 0, LEVEL.L2 + 0.7, 7.3, 7.45, 'railing', { collide: false, carve: false });
slab(0.7, 0.85, 0, LEVEL.L2 + 0.7, 7.3, 7.45, 'railing', { collide: false, carve: false });
for (let y = 0.35; y < LEVEL.L2 + 0.5; y += 0.36) {
  slab(-0.85, 0.85, y, y + 0.07, 7.3, 7.45, 'railing', { collide: false, carve: false });
}

// ==================================================================
//  NAV / SPAWNS / COVER
// ==================================================================
export const NAV_REGIONS = [
  { y: LEVEL.L1, x0: PLAY.minX, x1: PLAY.maxX, z0: PLAY.minZ, z1: PLAY.maxZ },
  { y: LEVEL.L2, x0: -10.5, x1: 6.5, z0: -6.5, z1: 6.5 },
  { y: LEVEL.L2, x0: 6.5, x1: 25, z0: -4.5, z1: 4.5 },
  { y: LEVEL.L3, x0: -5, x1: 6.5, z0: -5, z1: 5 },
];

export const SPAWNS = {
  BLUE: [
    { pos: [-5.5, 0, -34], yaw: 0 },
    { pos: [0, 0, -35], yaw: 0 },
    { pos: [5.5, 0, -34], yaw: 0 },
  ],
  RED: [
    { pos: [5.5, 0, 34], yaw: Math.PI },
    { pos: [0, 0, 35], yaw: Math.PI },
    { pos: [-5.5, 0, 34], yaw: Math.PI },
  ],
};

export const BUY_ZONES = {
  BLUE: { x0: -34, x1: 34, z0: -38, z1: -30 },
  RED: { x0: -34, x1: 34, z0: 30, z1: 38 },
};

export function inBuyZone(team, pos) {
  const z = BUY_ZONES[team];
  if (!z) return false;
  return pos[0] >= z.x0 && pos[0] <= z.x1 && pos[2] >= z.z0 && pos[2] <= z.z1;
}

export const COVER_POINTS = [
  { pos: [-10, 0, -10.5], lane: 'mid', tag: 'mid-crate-blue' },
  { pos: [10, 0, 10.5], lane: 'mid', tag: 'mid-crate-red' },
  { pos: [-10.8, 0, 11.5], lane: 'mid', tag: 'mid-stack-red' },
  { pos: [10.8, 0, -11.5], lane: 'mid', tag: 'mid-stack-blue' },
  { pos: [-1.5, 0, -17], lane: 'mid', tag: 'mid-barrier-blue' },
  { pos: [1.5, 0, 17], lane: 'mid', tag: 'mid-barrier-red' },
  { pos: [-9, 0, -22], lane: 'mid', tag: 'mid-machine-blue' },
  { pos: [9, 0, 22], lane: 'mid', tag: 'mid-machine-red' },
  { pos: [-10.5, 0, -4.5], lane: 'mid', tag: 'mid-stone-w' },
  { pos: [10.5, 0, 4.5], lane: 'mid', tag: 'mid-stone-e' },
  { pos: [0, 0, -26], lane: 'mid', tag: 'mid-far-blue' },
  { pos: [0, 0, 26], lane: 'mid', tag: 'mid-far-red' },
  { pos: [-8.5, 0, 0], lane: 'mid', tag: 'plat-west-base' },
  { pos: [8.5, 0, 0], lane: 'mid', tag: 'plat-east-base' },
  { pos: [-4.5, LEVEL.L2, -4.5], lane: 'mid', tag: 'plat-L2-nw', high: true },
  { pos: [4.5, LEVEL.L2, 4.5], lane: 'mid', tag: 'plat-L2-se', high: true },
  { pos: [-2, LEVEL.L3, -3.4], lane: 'mid', tag: 'plat-L3-n', high: true, sniper: true },
  { pos: [2.5, LEVEL.L3, 3.4], lane: 'mid', tag: 'plat-L3-s', high: true, sniper: true },
  { pos: [-31, 0, 0], lane: 'west', tag: 'west-deep' },
  { pos: [-19, 0, 0], lane: 'west', tag: 'west-room-mid' },
  { pos: [-16.5, 0, -13], lane: 'west', tag: 'west-machine-blue' },
  { pos: [-16.5, 0, 13], lane: 'west', tag: 'west-machine-red' },
  { pos: [-28, 0, -18], lane: 'west', tag: 'west-crate-blue' },
  { pos: [-28, 0, 18], lane: 'west', tag: 'west-crate-red' },
  { pos: [-21, 0, -28], lane: 'west', tag: 'west-entry-blue' },
  { pos: [-21, 0, 28], lane: 'west', tag: 'west-entry-red' },
  { pos: [-25.5, 0, -7], lane: 'west', tag: 'west-stone-blue' },
  { pos: [-25.5, 0, 7], lane: 'west', tag: 'west-stone-red' },
  { pos: [-15, 0, -16], lane: 'west', tag: 'west-door-blue' },
  { pos: [-15, 0, 16], lane: 'west', tag: 'west-door-red' },
  { pos: [17, 0, -29], lane: 'east', tag: 'east-cont-blue' },
  { pos: [17, 0, 29], lane: 'east', tag: 'east-cont-red' },
  { pos: [22, 0, -20], lane: 'east', tag: 'east-wood-blue' },
  { pos: [22, 0, 20], lane: 'east', tag: 'east-wood-red' },
  { pos: [29, 0, -21], lane: 'east', tag: 'east-deep-blue' },
  { pos: [29, 0, 21], lane: 'east', tag: 'east-deep-red' },
  { pos: [17, 0, -7], lane: 'east', tag: 'east-barrier-blue' },
  { pos: [17, 0, 7], lane: 'east', tag: 'east-barrier-red' },
  { pos: [26, 0, -11], lane: 'east', tag: 'east-wood-mid-b' },
  { pos: [26, 0, 11], lane: 'east', tag: 'east-wood-mid-r' },
  { pos: [21, LEVEL.L2, -2.5], lane: 'east', tag: 'east-platform', high: true, sniper: true },
  { pos: [13.5, LEVEL.L2, 0], lane: 'east', tag: 'east-catwalk', high: true },
  { pos: [-24, 0, -32], lane: 'west', tag: 'apron-blue-w' },
  { pos: [24, 0, -32], lane: 'east', tag: 'apron-blue-e' },
  { pos: [-24, 0, 32], lane: 'west', tag: 'apron-red-w' },
  { pos: [24, 0, 32], lane: 'east', tag: 'apron-red-e' },
];

export const LANE_PUSH_POINTS = {
  BLUE: {
    west: [[-21, 0, -24], [-19, 0, -8], [-19, 0, 5], [-21, 0, 19]],
    mid: [[-10, 0, -20], [-9, 0, -5], [0, LEVEL.L2, 0], [9, 0, 10]],
    east: [[21, 0, -24], [17, 0, -9], [21, LEVEL.L2, 0], [21, 0, 16]],
  },
  RED: {
    west: [[-21, 0, 24], [-19, 0, 8], [-19, 0, -5], [-21, 0, -19]],
    mid: [[10, 0, 20], [9, 0, 5], [0, LEVEL.L2, 0], [-9, 0, -10]],
    east: [[21, 0, 24], [17, 0, 9], [21, LEVEL.L2, 0], [21, 0, -16]],
  },
};

// Daylight map: work lamps are decorative only, the sun does the lighting.
export const SODIUM_LAMPS = [];
export const MOON_SHAFTS = [];

export const SOLIDS = brushes
  .filter((b) => b.collide)
  .map((b) => ({ min: b.min, max: b.max, surf: b.surf, id: b.id }));

export const COLLIDERS = brushes.filter((b) => b.collide);

export const MAP_META = {
  name: MAP_NAME,
  brushCount: brushes.length,
  solidCount: SOLIDS.length,
  coverCount: COVER_POINTS.length,
  outdoor: true,
};
