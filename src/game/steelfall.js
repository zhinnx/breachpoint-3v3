/**
 * BREACHPOINT — Map "Steelfall" (PRD §9)
 *
 * Abandoned steel foundry. Data-driven: one source of truth feeds
 *   - rendering (instanced PBR boxes)
 *   - Rapier collision (cuboid colliders)
 *   - the generated NavMesh (obstacle carving)
 *   - bot cover point data (PRD §8 "titik-titik cover yang ditandai di data peta")
 *
 * Layout (top-down, X = width, Z = blue(-) to red(+)):
 *   LEFT  lane  x[-25,-10]  tight roofed interior corridor  -> shotgun / SMG
 *   MID   lane  x[-10, 10]  open foundry floor + 3-storey smelter tower
 *   RIGHT lane  x[ 10, 25]  stacked crates + low walls, raised catwalk platform
 */

// ------------------------------------------------------------------ constants
export const MAP_NAME = 'Steelfall';
export const PLAY = { minX: -25, maxX: 25, minZ: -30, maxZ: 30 };
export const WALL_H = 9.5;

export const LEVEL = { L1: 0, L2: 3.4, L3: 6.8 };

const MAT_SURFACE = {
  concreteFloor: 'concrete',
  gravel: 'gravel',
  rustWall: 'metal',
  concreteWall: 'concrete',
  metalGrate: 'metal',
  metalPlate: 'metal',
  crateWood: 'wood',
  crateMetal: 'metal',
  machine: 'metal',
  pipe: 'metal',
  barrel: 'metal',
  railing: 'metal',
  ceiling: 'metal',
  hazard: 'metal',
};

export const brushes = [];
let _bid = 0;

/** Axis-aligned box defined by min/max on each axis. */
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
    carve: opts.carve !== false, // blocks navmesh
    cover: !!opts.cover,
    lane: opts.lane || null,
  };
  brushes.push(b);
  return b;
}

/** Wall along an axis with doorway gaps punched out. */
function wallX(x0, x1, thickness, z, gaps, y0, y1, mat, opts) {
  const segs = [];
  let cur = x0;
  const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
  for (const [g0, g1] of sorted) {
    if (g0 > cur) segs.push([cur, g0]);
    cur = Math.max(cur, g1);
  }
  if (cur < x1) segs.push([cur, x1]);
  for (const [a, b] of segs) slab(a, b, y0, y1, z - thickness / 2, z + thickness / 2, mat, opts);
  return segs;
}

function wallZ(z0, z1, thickness, x, gaps, y0, y1, mat, opts) {
  const segs = [];
  let cur = z0;
  const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
  for (const [g0, g1] of sorted) {
    if (g0 > cur) segs.push([cur, g0]);
    cur = Math.max(cur, g1);
  }
  if (cur < z1) segs.push([cur, z1]);
  for (const [a, b] of segs) slab(x - thickness / 2, x + thickness / 2, y0, y1, a, b, mat, opts);
  return segs;
}

// ------------------------------------------------------------------ ground
slab(PLAY.minX - 1, PLAY.maxX + 1, -1, 0, PLAY.minZ - 1, PLAY.maxZ + 1, 'concreteFloor', { carve: false });

// Gravel patch in mid (footstep variety, PRD §12)
slab(-9.5, 9.5, -0.02, 0.04, -22, -12, 'gravel', { collide: false, carve: false });
slab(-9.5, 9.5, -0.02, 0.04, 12, 22, 'gravel', { collide: false, carve: false });

// ------------------------------------------------------------------ outer shell
slab(PLAY.minX - 1, PLAY.minX, 0, WALL_H, PLAY.minZ - 1, PLAY.maxZ + 1, 'rustWall');
slab(PLAY.maxX, PLAY.maxX + 1, 0, WALL_H, PLAY.minZ - 1, PLAY.maxZ + 1, 'rustWall');
slab(PLAY.minX - 1, PLAY.maxX + 1, 0, WALL_H, PLAY.minZ - 1, PLAY.minZ, 'rustWall');
slab(PLAY.minX - 1, PLAY.maxX + 1, 0, WALL_H, PLAY.maxZ, PLAY.maxZ + 1, 'rustWall');

// ------------------------------------------------------------------ spawn aprons (PRD §4 safe zone)
// Wall separating each spawn room from the battlefield, with 3 exits (left / mid / right).
const SPAWN_GAPS = [[-20, -15], [-4, 4], [15, 20]];
wallX(PLAY.minX, PLAY.maxX, 0.8, -24, SPAWN_GAPS, 0, WALL_H, 'concreteWall');
wallX(PLAY.minX, PLAY.maxX, 0.8, 24, SPAWN_GAPS, 0, WALL_H, 'concreteWall');

// spawn room detailing
for (const s of [-1, 1]) {
  const z = 27 * s;
  slab(-25, -21, 0, 2.6, z - 2, z + 2, 'crateMetal', { cover: true });
  slab(21, 25, 0, 2.6, z - 2, z + 2, 'crateMetal', { cover: true });
  slab(-2.2, 2.2, 0, 0.9, z - 0.9 * s, z + 0.9 * s, 'crateWood', { cover: true });
  // overhead beams for silhouette
  slab(-25, 25, 8.6, 9.2, z - 0.4, z + 0.4, 'pipe', { collide: false, carve: false });
}

// ------------------------------------------------------------------ lane dividers
// Chokepoint doorways: blue-side connector, centre door, red-side connector (PRD §9 "Konektor").
const DIVIDER_GAPS = [[-14, -10], [-2, 2], [10, 14]];
wallZ(-24, 24, 0.8, -10, DIVIDER_GAPS, 0, WALL_H, 'rustWall');
wallZ(-24, 24, 0.8, 10, DIVIDER_GAPS, 0, WALL_H, 'rustWall');

// door frames (visual + chunky cover corners)
for (const x of [-10, 10]) {
  for (const [g0, g1] of DIVIDER_GAPS) {
    slab(x - 0.9, x + 0.9, 4.6, 5.2, g0 - 0.2, g1 + 0.2, 'metalPlate', { carve: false });
    slab(x - 0.9, x + 0.9, 0, 0.35, g0 - 0.2, g1 + 0.2, 'metalPlate', { carve: false, collide: false });
  }
}

// ==================================================================
//  MID — open foundry floor + 3-storey smelter tower
// ==================================================================

// --- smelter tower shell -------------------------------------------------
// corner pillars
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    slab(sx * 4.6 - 0.45, sx * 4.6 + 0.45, 0, 7.6, sz * 4.6 - 0.45, sz * 4.6 + 0.45, 'metalPlate', { cover: true, lane: 'mid' });
  }
}
// partial tower walls (leave firing ports / open sides)
slab(-5.05, -4.15, 0, 3.2, -4.6, -1.4, 'rustWall', { lane: 'mid' });
slab(-5.05, -4.15, 0, 3.2, 1.4, 4.6, 'rustWall', { lane: 'mid' });
slab(4.15, 5.05, 0, 3.2, -4.6, -1.4, 'rustWall', { lane: 'mid' });
slab(-4.6, -1.4, 0, 3.2, 4.15, 5.05, 'rustWall', { lane: 'mid' });
slab(1.4, 4.6, 0, 3.2, 4.15, 5.05, 'rustWall', { lane: 'mid' });
slab(-4.6, 4.6, 0, 3.2, -5.05, -4.15, 'rustWall', { lane: 'mid' });

// smelter furnace core (interior blocker on ground floor)
slab(-2.2, 2.2, 0, 2.9, -2.2, 2.2, 'machine', { cover: true, lane: 'mid' });
slab(-1.0, 1.0, 2.9, 3.2, -1.0, 1.0, 'hazard', { lane: 'mid', carve: false });

// --- L2 platform ---------------------------------------------------------
slab(-5.05, 5.05, 3.2, 3.4, -5.05, 5.05, 'metalGrate', { lane: 'mid' });
// west landing for stair A
slab(-8.3, -5.05, 3.2, 3.4, -3.1, -0.9, 'metalGrate', { lane: 'mid' });
// east landing for stair B
slab(5.05, 8.3, 3.2, 3.4, 0.9, 3.1, 'metalGrate', { lane: 'mid' });

// L2 railings (with gaps to keep sightlines open)
slab(-5.05, 5.05, 3.4, 4.4, -5.15, -4.95, 'railing', { carve: false, lane: 'mid' });
slab(-5.05, -1.6, 3.4, 4.4, 4.95, 5.15, 'railing', { carve: false, lane: 'mid' });
slab(1.6, 5.05, 3.4, 4.4, 4.95, 5.15, 'railing', { carve: false, lane: 'mid' });
slab(-5.15, -4.95, 3.4, 4.4, -5.05, -3.2, 'railing', { carve: false, lane: 'mid' });
slab(4.95, 5.15, 3.4, 4.4, -5.05, -1.4, 'railing', { carve: false, lane: 'mid' });
slab(4.95, 5.15, 3.4, 4.4, 3.2, 5.05, 'railing', { carve: false, lane: 'mid' });

// --- L3 sniper deck ------------------------------------------------------
slab(-4.05, 5.05, 6.6, 6.8, -4.05, 4.05, 'metalGrate', { lane: 'mid' });
slab(-4.05, 5.05, 6.8, 7.7, -4.15, -3.95, 'railing', { carve: false, lane: 'mid' });
slab(-4.05, 5.05, 6.8, 7.7, 3.95, 4.15, 'railing', { carve: false, lane: 'mid' });
slab(-4.15, -3.95, 6.8, 7.7, -4.05, 4.05, 'railing', { carve: false, lane: 'mid' });
slab(4.95, 5.15, 6.8, 7.7, -4.05, 0.8, 'railing', { carve: false, lane: 'mid' });
// small hard cover on the deck
slab(-2.4, -0.6, 6.8, 7.9, -3.8, -3.0, 'crateMetal', { cover: true, lane: 'mid' });
slab(1.2, 3.0, 6.8, 7.9, 3.0, 3.8, 'crateMetal', { cover: true, lane: 'mid' });

// --- mid cover objects ---------------------------------------------------
const midCover = [
  // [x0,x1,y1,z0,z1,mat]
  [-9.4, -6.4, 1.25, -9.6, -7.0, 'crateWood'],
  [-9.4, -7.6, 2.5, 8.0, 10.4, 'crateMetal'],
  [6.4, 9.4, 1.25, 7.0, 9.6, 'crateWood'],
  [6.8, 9.4, 2.5, -10.4, -8.0, 'crateMetal'],
  [-3.2, 0.4, 1.1, -12.4, -11.2, 'concreteWall'], // low barrier
  [-0.4, 3.2, 1.1, 11.2, 12.4, 'concreteWall'],
  [-8.6, -5.0, 1.6, -16.6, -14.6, 'machine'], // wrecked machine
  [5.0, 8.6, 1.6, 14.6, 16.6, 'machine'],
  [-2.6, 2.6, 1.0, -19.4, -18.2, 'crateWood'],
  [-2.6, 2.6, 1.0, 18.2, 19.4, 'crateWood'],
];
for (const [x0, x1, y1, z0, z1, mat] of midCover) {
  slab(x0, x1, 0, y1, z0, z1, mat, { cover: true, lane: 'mid' });
}
// Overturned carts (PRD §9 cover list).
// NOTE: kept clear of the stair footprints (Stair A occupies x[-8.3,-5.6] z[-0.9,5.2],
// Stair B occupies x[5.6,8.3] z[-5.2,0.9]) — parking a cart on the steps severs the
// only ground->tower NavMesh link and strands the bots on the ground floor.
slab(-9.6, -7.8, 0, 1.35, -6.4, -4.6, 'crateMetal', { cover: true, lane: 'mid' });
slab(7.8, 9.6, 0, 1.35, 4.6, 6.4, 'crateMetal', { cover: true, lane: 'mid' });
// barrels
for (const [bx, bz] of [[-8.6, -3.4], [-8.0, -4.6], [8.6, 3.4], [8.0, 4.6], [-6.2, 17.8], [6.2, -17.8]]) {
  slab(bx - 0.42, bx + 0.42, 0, 1.15, bz - 0.42, bz + 0.42, 'barrel', { cover: true, lane: 'mid' });
}

// ==================================================================
//  LEFT LANE — narrow roofed interior corridor
// ==================================================================
// inner dividing walls creating outer + inner corridors with a central room
wallZ(-22, -6.5, 0.7, -18, [], 0, 5.0, 'concreteWall', { lane: 'left' });
wallZ(6.5, 22, 0.7, -18, [], 0, 5.0, 'concreteWall', { lane: 'left' });
// central room side pockets
slab(-24.6, -21.5, 0, 2.4, -3.0, 3.0, 'crateMetal', { cover: true, lane: 'left' });
slab(-16.4, -13.0, 0, 1.2, -1.5, 1.5, 'crateWood', { cover: true, lane: 'left' });
slab(-13.4, -11.4, 0, 2.2, -8.6, -6.6, 'machine', { cover: true, lane: 'left' });
slab(-13.4, -11.4, 0, 2.2, 6.6, 8.6, 'machine', { cover: true, lane: 'left' });
slab(-22.6, -19.6, 0, 1.15, -12.4, -10.6, 'crateWood', { cover: true, lane: 'left' });
slab(-22.6, -19.6, 0, 1.15, 10.6, 12.4, 'crateWood', { cover: true, lane: 'left' });
slab(-17.2, -14.2, 0, 1.9, -20.4, -19.0, 'crateMetal', { cover: true, lane: 'left' });
slab(-17.2, -14.2, 0, 1.9, 19.0, 20.4, 'crateMetal', { cover: true, lane: 'left' });
for (const [bx, bz] of [[-20.4, -6.2], [-19.6, -7.0], [-20.4, 6.2], [-19.6, 7.0], [-12.2, -16.0], [-12.2, 16.0]]) {
  slab(bx - 0.42, bx + 0.42, 0, 1.15, bz - 0.42, bz + 0.42, 'barrel', { cover: true, lane: 'left' });
}
// roof over the left lane, with skylight gaps (PRD §9 broken skylights)
const ROOF_Y = 5.0;
const skylights = [[-8.5, -4.5], [3.0, 7.0], [14.5, 18.5]];
{
  let cur = -23.5;
  const segs = [];
  for (const [a, b] of skylights) {
    if (a > cur) segs.push([cur, a]);
    cur = b;
  }
  segs.push([cur, 23.5]);
  for (const [a, b] of segs) slab(-25, -10, ROOF_Y, ROOF_Y + 0.5, a, b, 'ceiling', { carve: false, lane: 'left' });
}
// overhead pipes in the left lane
for (const z of [-20, -14, -2, 4, 12, 20]) {
  slab(-25, -10, 4.1, 4.5, z - 0.22, z + 0.22, 'pipe', { collide: false, carve: false, lane: 'left' });
}

// ==================================================================
//  RIGHT LANE — crate yard + raised catwalk platform
// ==================================================================
const rightCover = [
  [11.4, 14.4, 2.5, -20.4, -17.4, 'crateMetal'],
  [15.0, 18.0, 1.25, -19.0, -16.0, 'crateWood'],
  [20.0, 24.0, 2.5, -14.0, -11.0, 'crateMetal'],
  [11.4, 14.4, 1.1, -9.0, -6.5, 'concreteWall'],
  [17.5, 22.5, 1.25, -7.0, -4.4, 'crateWood'],
  [21.0, 24.6, 2.2, -1.6, 1.6, 'machine'],
  [11.4, 14.4, 1.1, 6.5, 9.0, 'concreteWall'],
  [17.5, 22.5, 1.25, 4.4, 7.0, 'crateWood'],
  [20.0, 24.0, 2.5, 11.0, 14.0, 'crateMetal'],
  [15.0, 18.0, 1.25, 16.0, 19.0, 'crateWood'],
  [11.4, 14.4, 2.5, 17.4, 20.4, 'crateMetal'],
];
for (const [x0, x1, y1, z0, z1, mat] of rightCover) {
  slab(x0, x1, 0, y1, z0, z1, mat, { cover: true, lane: 'right' });
}
for (const [bx, bz] of [[16.2, -11.4], [17.0, -10.7], [16.2, 11.4], [17.0, 10.7], [12.6, 0.2], [23.2, -18.4], [23.2, 18.4]]) {
  slab(bx - 0.42, bx + 0.42, 0, 1.15, bz - 0.42, bz + 0.42, 'barrel', { cover: true, lane: 'right' });
}

// catwalk from tower L2 through the mid door into the right lane (PRD §9 flank rotation)
slab(8.3, 13.0, 3.2, 3.4, -1.2, 1.2, 'metalGrate', { lane: 'right' });
slab(8.3, 13.0, 3.4, 4.3, -1.35, -1.15, 'railing', { carve: false });
slab(8.3, 13.0, 3.4, 4.3, 1.15, 1.35, 'railing', { carve: false });
// raised platform in the right lane
slab(13.0, 20.0, 3.2, 3.4, -3.6, 3.6, 'metalPlate', { lane: 'right' });
slab(13.0, 20.0, 3.4, 4.3, -3.75, -3.55, 'railing', { carve: false });
slab(13.0, 20.0, 3.4, 4.3, 3.55, 3.75, 'railing', { carve: false });
slab(19.8, 20.0, 3.4, 4.3, -3.6, 3.6, 'railing', { carve: false });
slab(15.6, 17.4, 3.4, 4.5, -3.6, -2.9, 'crateMetal', { cover: true, lane: 'right' });

// support pillars for the platform
for (const [px, pz] of [[13.6, -3.0], [13.6, 3.0], [19.2, -3.0], [19.2, 3.0], [9.2, 0]]) {
  slab(px - 0.28, px + 0.28, 0, 3.2, pz - 0.28, pz + 0.28, 'metalPlate', { lane: 'right' });
}

// ==================================================================
//  STAIRS & RAMPS  (rendered as stepped boxes, navmesh sees smooth ramps)
// ==================================================================
export const RAMPS = [];

/**
 * Build a run of steps. Axis 'z' means it climbs along Z.
 * Also registers the smooth ramp quad used by the navmesh builder.
 */
function stairs({ x0, x1, zStart, zEnd, yStart, yEnd, steps = 12, mat = 'metalPlate' }) {
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

// Stair A: ground -> L2 (west of the tower)
stairs({ x0: -8.3, x1: -5.6, zStart: 5.2, zEnd: -0.9, yStart: 0, yEnd: LEVEL.L2, steps: 14 });
// Stair B: L2 -> L3 (east of the tower)
stairs({ x0: 5.6, x1: 8.3, zStart: -5.2, zEnd: 0.9, yStart: LEVEL.L2, yEnd: LEVEL.L3, steps: 14 });
// Ramp: right-lane platform -> ground
stairs({ x0: 14.2, x1: 17.2, zStart: 3.6, zEnd: 9.8, yStart: LEVEL.L2, yEnd: 0, steps: 14 });

// ==================================================================
//  LADDER (PRD §9 — "1 ladder shortcut")
// ==================================================================
export const LADDERS = [
  { min: [-0.75, 0, 5.05], max: [0.75, LEVEL.L2 + 0.5, 6.15], top: [0, LEVEL.L2 + 0.1, 4.2], bottom: [0, 0, 6.6] },
];
// ladder rails (visual, non-blocking)
slab(-0.72, -0.6, 0, LEVEL.L2 + 0.7, 5.9, 6.02, 'railing', { collide: false, carve: false });
slab(0.6, 0.72, 0, LEVEL.L2 + 0.7, 5.9, 6.02, 'railing', { collide: false, carve: false });
for (let y = 0.35; y < LEVEL.L2 + 0.5; y += 0.36) {
  slab(-0.72, 0.72, y, y + 0.07, 5.9, 6.02, 'railing', { collide: false, carve: false });
}

// ==================================================================
//  NAV REGIONS  (walkable rectangles per level; obstacles carved automatically)
// ==================================================================
export const NAV_REGIONS = [
  { y: LEVEL.L1, x0: PLAY.minX, x1: PLAY.maxX, z0: PLAY.minZ, z1: PLAY.maxZ },
  { y: LEVEL.L2, x0: -8.3, x1: 5.05, z0: -5.05, z1: 5.05 },
  { y: LEVEL.L2, x0: -8.3, x1: -5.05, z0: -3.1, z1: -0.9 },
  { y: LEVEL.L2, x0: 5.05, x1: 8.3, z0: 0.9, z1: 3.1 },
  { y: LEVEL.L2, x0: 8.3, x1: 20.0, z0: -3.6, z1: 3.6 },
  { y: LEVEL.L3, x0: -4.05, x1: 5.05, z0: -4.05, z1: 4.05 },
];

// ==================================================================
//  SPAWNS  (PRD §2 — sides swap after round 4)
// ==================================================================
export const SPAWNS = {
  BLUE: [
    { pos: [-4.5, 0, -27.5], yaw: 0 },
    { pos: [0, 0, -28.5], yaw: 0 },
    { pos: [4.5, 0, -27.5], yaw: 0 },
  ],
  RED: [
    { pos: [4.5, 0, 27.5], yaw: Math.PI },
    { pos: [0, 0, 28.5], yaw: Math.PI },
    { pos: [-4.5, 0, 27.5], yaw: Math.PI },
  ],
};

export const BUY_ZONES = {
  BLUE: { x0: -25, x1: 25, z0: -30, z1: -24 },
  RED: { x0: -25, x1: 25, z0: 24, z1: 30 },
};

export function inBuyZone(team, pos) {
  const z = BUY_ZONES[team];
  if (!z) return false;
  return pos[0] >= z.x0 && pos[0] <= z.x1 && pos[2] >= z.z0 && pos[2] <= z.z1;
}

// ==================================================================
//  COVER POINTS (PRD §8) — hand-tagged tactical anchors used by the bot AI
// ==================================================================
/** @type {{pos:[number,number,number], lane:string, tag:string}[]} */
export const COVER_POINTS = [
  // mid ground
  { pos: [-7.8, 0, -8.2], lane: 'mid', tag: 'mid-crate-blue' },
  { pos: [7.8, 0, 8.2], lane: 'mid', tag: 'mid-crate-red' },
  { pos: [-8.6, 0, 9.4], lane: 'mid', tag: 'mid-stack-red' },
  { pos: [8.6, 0, -9.4], lane: 'mid', tag: 'mid-stack-blue' },
  { pos: [-1.4, 0, -13.4], lane: 'mid', tag: 'mid-barrier-blue' },
  { pos: [1.4, 0, 13.4], lane: 'mid', tag: 'mid-barrier-red' },
  { pos: [-6.8, 0, -17.6], lane: 'mid', tag: 'mid-machine-blue' },
  { pos: [6.8, 0, 17.6], lane: 'mid', tag: 'mid-machine-red' },
  { pos: [-8.7, 0, -5.5], lane: 'mid', tag: 'mid-cart-w' },
  { pos: [8.7, 0, 5.5], lane: 'mid', tag: 'mid-cart-e' },
  { pos: [0, 0, -20.4], lane: 'mid', tag: 'mid-crate-far-blue' },
  { pos: [0, 0, 20.4], lane: 'mid', tag: 'mid-crate-far-red' },
  { pos: [-7.4, 0, -0.2], lane: 'mid', tag: 'tower-west-base' },
  { pos: [7.4, 0, 0.2], lane: 'mid', tag: 'tower-east-base' },
  // tower verticality
  { pos: [-3.4, LEVEL.L2, -3.4], lane: 'mid', tag: 'tower-L2-nw', high: true },
  { pos: [3.4, LEVEL.L2, 3.4], lane: 'mid', tag: 'tower-L2-se', high: true },
  { pos: [-1.5, LEVEL.L3, -2.6], lane: 'mid', tag: 'tower-L3-north', high: true, sniper: true },
  { pos: [2.1, LEVEL.L3, 2.6], lane: 'mid', tag: 'tower-L3-south', high: true, sniper: true },
  // left lane
  { pos: [-22.8, 0, -0.2], lane: 'left', tag: 'left-deep-w' },
  { pos: [-14.8, 0, 0], lane: 'left', tag: 'left-room-mid' },
  { pos: [-12.4, 0, -9.8], lane: 'left', tag: 'left-machine-blue' },
  { pos: [-12.4, 0, 9.8], lane: 'left', tag: 'left-machine-red' },
  { pos: [-21.0, 0, -13.6], lane: 'left', tag: 'left-crate-blue' },
  { pos: [-21.0, 0, 13.6], lane: 'left', tag: 'left-crate-red' },
  { pos: [-15.7, 0, -21.6], lane: 'left', tag: 'left-entry-blue' },
  { pos: [-15.7, 0, 21.6], lane: 'left', tag: 'left-entry-red' },
  { pos: [-11.6, 0, -12.2], lane: 'left', tag: 'left-door-blue' },
  { pos: [-11.6, 0, 12.2], lane: 'left', tag: 'left-door-red' },
  // right lane
  { pos: [12.9, 0, -21.8], lane: 'right', tag: 'right-crate-blue' },
  { pos: [12.9, 0, 21.8], lane: 'right', tag: 'right-crate-red' },
  { pos: [16.5, 0, -14.6], lane: 'right', tag: 'right-wood-blue' },
  { pos: [16.5, 0, 14.6], lane: 'right', tag: 'right-wood-red' },
  { pos: [22.0, 0, -15.4], lane: 'right', tag: 'right-deep-blue' },
  { pos: [22.0, 0, 15.4], lane: 'right', tag: 'right-deep-red' },
  { pos: [12.9, 0, -5.2], lane: 'right', tag: 'right-barrier-blue' },
  { pos: [12.9, 0, 5.2], lane: 'right', tag: 'right-barrier-red' },
  { pos: [20.0, 0, -8.6], lane: 'right', tag: 'right-wood-mid-b' },
  { pos: [20.0, 0, 8.6], lane: 'right', tag: 'right-wood-mid-r' },
  { pos: [16.4, LEVEL.L2, -2.2], lane: 'right', tag: 'right-platform', high: true, sniper: true },
  { pos: [11.0, LEVEL.L2, 0], lane: 'right', tag: 'right-catwalk', high: true },
  // spawn aprons (fallback / retreat)
  { pos: [-17.5, 0, -25.5], lane: 'left', tag: 'apron-blue-left' },
  { pos: [17.5, 0, -25.5], lane: 'right', tag: 'apron-blue-right' },
  { pos: [-17.5, 0, 25.5], lane: 'left', tag: 'apron-red-left' },
  { pos: [17.5, 0, 25.5], lane: 'right', tag: 'apron-red-right' },
];

/** Attack anchors a bot walks toward when pushing the enemy half. */
export const LANE_PUSH_POINTS = {
  BLUE: {
    left: [[-15.7, 0, -18], [-14.5, 0, -6], [-14.8, 0, 4], [-16, 0, 15]],
    mid: [[-7.6, 0, -16], [-7.4, 0, -4], [0, LEVEL.L2, 0], [6.5, 0, 8]],
    right: [[16, 0, -18], [13, 0, -7], [16.4, LEVEL.L2, 0], [16, 0, 12]],
  },
  RED: {
    left: [[-15.7, 0, 18], [-14.5, 0, 6], [-14.8, 0, -4], [-16, 0, -15]],
    mid: [[7.6, 0, 16], [7.4, 0, 4], [0, LEVEL.L2, 0], [-6.5, 0, -8]],
    right: [[16, 0, 18], [13, 0, 7], [16.4, LEVEL.L2, 0], [16, 0, -12]],
  },
};

// ==================================================================
//  LIGHTING (PRD §9 — sodium work lamps + blue moonlight through skylights)
// ==================================================================
export const SODIUM_LAMPS = [
  [-18, 4.4, -16], [-18, 4.4, -4], [-18, 4.4, 8], [-18, 4.4, 18],
  [-12.5, 4.4, -20], [-12.5, 4.4, 20],
  [-7.5, 6.5, -19], [7.5, 6.5, 19], [-7.5, 6.5, 7], [7.5, 6.5, -7],
  [0, 8.4, -12], [0, 8.4, 12],
  [16, 6.2, -18], [16, 6.2, 18], [22, 5.4, -6], [22, 5.4, 6],
  [0, 5.6, -26], [0, 5.6, 26],
  [0, 8.0, 0],
];

export const MOON_SHAFTS = [
  { pos: [-17.5, 5.2, -6.5], radius: 2.4, height: 5.2 },
  { pos: [-17.5, 5.2, 5.0], radius: 2.4, height: 5.2 },
  { pos: [-17.5, 5.2, 16.5], radius: 2.4, height: 5.2 },
  { pos: [-6, 9.4, -14], radius: 3.4, height: 9.4 },
  { pos: [6, 9.4, 14], radius: 3.4, height: 9.4 },
  { pos: [17, 9.4, -10], radius: 3.2, height: 9.4 },
  { pos: [17, 9.4, 10], radius: 3.2, height: 9.4 },
  { pos: [0, 9.4, 0], radius: 4.0, height: 9.4 },
];

// ==================================================================
//  RAYCAST WORLD MODEL — plain AABB list used by AI line-of-sight and
//  the deterministic hitscan solver (kept out of the physics thread).
// ==================================================================
export const SOLIDS = brushes
  .filter((b) => b.collide)
  .map((b) => ({ min: b.min, max: b.max, surf: b.surf, id: b.id }));

export const COLLIDERS = brushes.filter((b) => b.collide);

export const MAP_META = {
  name: MAP_NAME,
  brushCount: brushes.length,
  solidCount: SOLIDS.length,
  coverCount: COVER_POINTS.length,
};
