/**
 * BREACHPOINT — Map "Rangeyard" (practice only).
 *
 * A deliberately different space from the combat map: a flat, open, brightly
 * lit training yard. No lanes, no chokepoints, no roof. Firing bays along the
 * south wall, a strafing corridor for moving targets, and scattered cover so
 * players can rehearse peeking without a real fight.
 */

export const MAP_NAME = 'Rangeyard';
export const PLAY = { minX: -30, maxX: 30, minZ: -26, maxZ: 34 };
export const WALL_H = 7.0;
export const LEVEL = { L1: 0, L2: 3.2, L3: 3.2 };
export const OUTDOOR = true;

const MAT_SURFACE = {
  sandFloor: 'concrete',
  gravel: 'gravel',
  plaster: 'concrete',
  concreteWall: 'concrete',
  metalDeck: 'metal',
  container: 'metal',
  crateWood: 'wood',
  barrel: 'metal',
  railing: 'metal',
  canopy: 'metal',
  target: 'metal',
};

export const brushes = [];
let _bid = 0;

function slab(x0, x1, y0, y1, z0, z1, mat, opts = {}) {
  const b = {
    id: `r${_bid++}`,
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

// ground + perimeter
slab(PLAY.minX - 2, PLAY.maxX + 2, -1, 0, PLAY.minZ - 2, PLAY.maxZ + 2, 'sandFloor', { carve: false });
slab(-20, 20, -0.02, 0.03, 4, 28, 'gravel', { collide: false, carve: false });
slab(PLAY.minX - 2, PLAY.minX, 0, WALL_H, PLAY.minZ - 2, PLAY.maxZ + 2, 'plaster');
slab(PLAY.maxX, PLAY.maxX + 2, 0, WALL_H, PLAY.minZ - 2, PLAY.maxZ + 2, 'plaster');
slab(PLAY.minX - 2, PLAY.maxX + 2, 0, WALL_H, PLAY.minZ - 2, PLAY.minZ, 'plaster');
slab(PLAY.minX - 2, PLAY.maxX + 2, 0, WALL_H, PLAY.maxZ, PLAY.maxZ + 2, 'plaster');

// ---- firing line: shaded bays along the south edge
slab(-24, 24, 4.4, 4.7, -24, -17, 'canopy', { carve: false });
for (let x = -22; x <= 20; x += 7) {
  slab(x, x + 0.6, 0, 1.15, -24, -17, 'concreteWall', { cover: true });
  slab(x, x + 5, 0, 1.05, -18.4, -17.6, 'crateWood', { cover: true });
}
// distance markers, purely visual
for (const [z, w] of [[-5, 0.5], [5, 0.5], [15, 0.5], [25, 0.5]]) {
  slab(-26, 26, 0.01, 0.05, z - w / 2, z + w / 2, 'target', { collide: false, carve: false });
}

// ---- mid-field cover for peek practice
const cover = [
  [-16, -12, 1.3, -8, -5, 'crateWood'],
  [12, 16, 1.3, -8, -5, 'crateWood'],
  [-6, -2, 2.5, 2, 6, 'container'],
  [2, 6, 2.5, 2, 6, 'container'],
  [-22, -18, 2.5, 8, 12, 'container'],
  [18, 22, 2.5, 8, 12, 'container'],
  [-12, -8, 1.15, 16, 19, 'concreteWall'],
  [8, 12, 1.15, 16, 19, 'concreteWall'],
  [-4, 4, 1.3, 24, 27, 'crateWood'],
];
for (const [x0, x1, y1, z0, z1, mat] of cover) slab(x0, x1, 0, y1, z0, z1, mat, { cover: true });
for (const [bx, bz] of [[-19, -2], [-18.1, -1.1], [19, -2], [18.1, -1.1], [0, 14], [0.9, 14.9]]) {
  slab(bx - 0.45, bx + 0.45, 0, 1.2, bz - 0.45, bz + 0.45, 'barrel', { cover: true });
}

// ---- elevated platform, for practising high angles
slab(-26, -18, 3.0, 3.2, 18, 26, 'metalDeck');
slab(-26, -18, 3.2, 4.1, 17.9, 18.1, 'railing', { carve: false });
slab(-26, -18, 3.2, 4.1, 25.9, 26.1, 'railing', { carve: false });
slab(-26.1, -25.9, 3.2, 4.1, 18, 26, 'railing', { carve: false });
for (const [px, pz] of [[-25, 19], [-25, 25], [-19, 19], [-19, 25]]) {
  slab(px - 0.3, px + 0.3, 0, 3.0, pz - 0.3, pz + 0.3, 'metalDeck');
}

export const RAMPS = [];
function stairs({ x0, x1, zStart, zEnd, yStart, yEnd, steps = 12, mat = 'metalDeck' }) {
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
stairs({ x0: -23.5, x1: -20.5, zStart: 17.8, zEnd: 11, yStart: LEVEL.L2, yEnd: 0, steps: 14 });

export const LADDERS = [];

export const NAV_REGIONS = [
  { y: LEVEL.L1, x0: PLAY.minX, x1: PLAY.maxX, z0: PLAY.minZ, z1: PLAY.maxZ },
  { y: LEVEL.L2, x0: -26, x1: -18, z0: 18, z1: 26 },
];

// Player starts on the firing line; targets live downrange.
export const SPAWNS = {
  BLUE: [
    // Just in front of the shade canopy (which spans z[-24,-17]) so the view
    // downrange is unobstructed.
    { pos: [-3.5, 0, -15], yaw: 0 },
    { pos: [0, 0, -15], yaw: 0 },
    { pos: [3.5, 0, -15], yaw: 0 },
  ],
  RED: [
    { pos: [-8, 0, 20], yaw: Math.PI },
    { pos: [0, 0, 24], yaw: Math.PI },
    { pos: [8, 0, 20], yaw: Math.PI },
  ],
};

export const BUY_ZONES = {
  BLUE: { x0: -30, x1: 30, z0: -26, z1: 34 }, // whole yard: buy anywhere
  RED: { x0: -30, x1: 30, z0: -26, z1: 34 },
};
export function inBuyZone() { return true; }

export const COVER_POINTS = [
  { pos: [-14, 0, -6.5], lane: 'mid', tag: 'r-crate-w' },
  { pos: [14, 0, -6.5], lane: 'mid', tag: 'r-crate-e' },
  { pos: [-4, 0, 4], lane: 'mid', tag: 'r-cont-w' },
  { pos: [4, 0, 4], lane: 'mid', tag: 'r-cont-e' },
  { pos: [-20, 0, 10], lane: 'west', tag: 'r-cont-far-w' },
  { pos: [20, 0, 10], lane: 'east', tag: 'r-cont-far-e' },
  { pos: [-10, 0, 17.5], lane: 'west', tag: 'r-wall-w' },
  { pos: [10, 0, 17.5], lane: 'east', tag: 'r-wall-e' },
  { pos: [0, 0, 25.5], lane: 'mid', tag: 'r-back' },
  { pos: [-22, LEVEL.L2, 22], lane: 'west', tag: 'r-platform', high: true },
  { pos: [-19, 0, -2], lane: 'west', tag: 'r-barrel-w' },
  { pos: [19, 0, -2], lane: 'east', tag: 'r-barrel-e' },
];

/** Patrol routes for the moving targets (walk / run / zigzag). */
export const PRACTICE_ROUTES = [
  { mode: 'walk', points: [[-16, 0, 8], [16, 0, 8]] },
  { mode: 'run', points: [[-18, 0, 20], [18, 0, 20]] },
  { mode: 'zigzag', points: [[-10, 0, 14], [-4, 0, 22], [4, 0, 14], [10, 0, 22]] },
  { mode: 'strafe', points: [[-8, 0, 2], [8, 0, 2]] },
];

export const LANE_PUSH_POINTS = {
  BLUE: {
    west: [[-16, 0, 8], [-10, 0, 17.5]],
    mid: [[0, 0, 4], [0, 0, 25.5]],
    east: [[16, 0, 8], [10, 0, 17.5]],
  },
  RED: {
    west: [[-16, 0, 8], [-10, 0, 17.5]],
    mid: [[0, 0, 4], [0, 0, 25.5]],
    east: [[16, 0, 8], [10, 0, 17.5]],
  },
};

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
  practice: true,
};
