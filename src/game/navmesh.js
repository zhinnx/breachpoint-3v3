/**
 * BREACHPOINT — NavMesh generation for bot navigation (PRD §8, §15).
 *
 * Steelfall is authored as boxes, not as a hand-built nav asset, so the mesh is
 * baked at runtime with a voxel/heightfield approach (Recast-style, simplified):
 *
 *   1. Sample a single GLOBAL integer lattice over the play area. Using one
 *      lattice for every floor level is essential — per-region grids with
 *      fractional origins produce vertices that never weld, which shatters the
 *      zone into disconnected islands and makes findPath() return null.
 *   2. For each cell, auto-discover every standable surface height (ground,
 *      catwalks, tower decks, stair treads) by scanning world solids and
 *      testing agent clearance. No hand-authored region list required.
 *   3. Union-find neighbouring surfaces whose height differs by <= STEP_UP,
 *      so staircases naturally stitch levels together.
 *   4. Emit quads whose corner heights are AVERAGED per (corner, component).
 *      Adjacent cells therefore share byte-identical corner positions, which
 *      guarantees vertex welding — and turns stair treads into smooth ramps.
 *
 * The result is fed to three-pathfinding's Pathfinding.createZone().
 */
import * as THREE from 'three';
import { Pathfinding } from 'three-pathfinding';
import { SOLIDS, PLAY, LEVEL, LADDERS, NAV_REGIONS, SPAWNS } from './steelfall.js';
import { onMapChange } from './mapRegistry.js';

export const ZONE = 'steelfall';

const CELL = 1.0;
const AGENT_RADIUS = 0.42;
const AGENT_HEIGHT = 1.72;
const STEP_UP = 0.55; // plain step a capsule can climb (matches MOVE.stepHeight)
const RAMP_UP = 1.0; // larger delta allowed when the gap is a real slope/staircase
const FLOOR_CLUSTER = 1.9; // surfaces closer than this are the same "floor"
const MIN_COMPONENT = 8; // discard tiny islands (single crate tops etc.)
const MAX_HEIGHT = 9.0;

// Bounds depend on the active map, so read them at bake time, not import time.
const bounds = () => ({
  IX0: Math.ceil(PLAY.minX / CELL),
  IX1: Math.floor(PLAY.maxX / CELL) - 1,
  IZ0: Math.ceil(PLAY.minZ / CELL),
  IZ1: Math.floor(PLAY.maxZ / CELL) - 1,
});

// ------------------------------------------------------------------ solid lookup
const BUCKET = 4;
const solidBuckets = new Map();
const bkey = (bx, bz) => bx * 8192 + bz;

function indexSolids() {
  solidBuckets.clear();
  for (let i = 0; i < SOLIDS.length; i++) {
    const s = SOLIDS[i];
    const bx0 = Math.floor((s.min[0] - 1) / BUCKET);
    const bx1 = Math.floor((s.max[0] + 1) / BUCKET);
    const bz0 = Math.floor((s.min[2] - 1) / BUCKET);
    const bz1 = Math.floor((s.max[2] + 1) / BUCKET);
    for (let bx = bx0; bx <= bx1; bx++) {
      for (let bz = bz0; bz <= bz1; bz++) {
        const k = bkey(bx, bz);
        let arr = solidBuckets.get(k);
        if (!arr) solidBuckets.set(k, (arr = []));
        arr.push(s);
      }
    }
  }
}
indexSolids();

function solidsNear(x, z) {
  return solidBuckets.get(bkey(Math.floor(x / BUCKET), Math.floor(z / BUCKET))) || [];
}

/** Every height an agent could stand on at (cx, cz). */
function surfacesAt(cx, cz) {
  const near = solidsNear(cx, cz);
  const candidates = [];
  for (let i = 0; i < near.length; i++) {
    const s = near[i];
    if (cx < s.min[0] || cx > s.max[0]) continue;
    if (cz < s.min[2] || cz > s.max[2]) continue;
    const h = s.max[1];
    if (h < -0.5 || h > MAX_HEIGHT) continue;
    candidates.push(h);
  }
  if (!candidates.length) return [];

  // Cluster: treads of one staircase collapse to their top; real floors stay apart.
  candidates.sort((a, b) => b - a);
  const levels = [];
  let clusterTop = candidates[0];
  let prev = candidates[0];
  for (let i = 1; i <= candidates.length; i++) {
    const h = candidates[i];
    if (h === undefined || prev - h > FLOOR_CLUSTER) {
      levels.push(clusterTop);
      if (h === undefined) break;
      clusterTop = h;
    }
    prev = h;
  }

  // Clearance test: can a capsule actually stand here?
  const out = [];
  for (const h of levels) {
    const headY = h + AGENT_HEIGHT;
    const footY = h + 0.12;
    let blocked = false;
    for (let i = 0; i < near.length; i++) {
      const s = near[i];
      if (s.max[1] <= h + STEP_UP) continue; // low enough to step onto
      if (s.min[1] >= headY) continue; // above the head
      if (s.max[1] <= footY) continue; // below the feet
      if (cx + AGENT_RADIUS <= s.min[0] || cx - AGENT_RADIUS >= s.max[0]) continue;
      if (cz + AGENT_RADIUS <= s.min[2] || cz - AGENT_RADIUS >= s.max[2]) continue;
      blocked = true;
      break;
    }
    if (!blocked) out.push(h);
  }
  return out;
}

// ------------------------------------------------------------------ bake
let _geometry = null;
let _pathfinding = null;
let _zoneData = null;
let _cells = null; // flat list of {ix, iz, h, comp}
let _cellMap = null; // "ix|iz" -> cell[]
let _stats = null;

function bake() {
  const cells = [];
  const cellMap = new Map();

  const { IX0, IX1, IZ0, IZ1 } = bounds();
  for (let ix = IX0; ix <= IX1; ix++) {
    for (let iz = IZ0; iz <= IZ1; iz++) {
      const cx = ix + 0.5;
      const cz = iz + 0.5;
      const hs = surfacesAt(cx, cz);
      if (!hs.length) continue;
      const key = `${ix}|${iz}`;
      const list = [];
      for (const h of hs) {
        const c = { ix, iz, h, idx: cells.length, comp: -1 };
        cells.push(c);
        list.push(c);
      }
      cellMap.set(key, list);
    }
  }

  // ---- union-find over walkable neighbours
  const parent = new Int32Array(cells.length);
  for (let i = 0; i < cells.length; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent[rb] = ra; };

  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  /**
   * A staircase is sampled one tread per cell, so consecutive treads can differ
   * by more than a single step. Allow the larger RAMP_UP delta only when the
   * climb continues in the same direction (i.e. it really is a slope), which
   * stitches stairs together without letting bots "step" onto crates or roofs.
   */
  const heightsAt = (ix, iz) => cellMap.get(`${ix}|${iz}`) || [];
  const continuesSlope = (c, dx, dz, delta) => {
    const ahead = heightsAt(c.ix + dx * 2, c.iz + dz * 2);
    for (const a of ahead) {
      const d2 = a.h - (c.h + delta);
      if (Math.sign(d2) === Math.sign(delta) && Math.abs(d2) <= RAMP_UP + 0.05) return true;
    }
    const behind = heightsAt(c.ix - dx, c.iz - dz);
    for (const b of behind) {
      const d0 = c.h - b.h;
      if (Math.sign(d0) === Math.sign(delta) && Math.abs(d0) <= RAMP_UP + 0.05) return true;
    }
    return false;
  };

  for (const c of cells) {
    for (const [dx, dz] of NB) {
      for (const o of heightsAt(c.ix + dx, c.iz + dz)) {
        const delta = o.h - c.h;
        const ad = Math.abs(delta);
        if (ad <= STEP_UP) { union(c.idx, o.idx); continue; }
        if (ad <= RAMP_UP && continuesSlope(c, dx, dz, delta)) union(c.idx, o.idx);
      }
    }
  }

  // ---- keep only what is actually reachable from the spawn floor
  // (roofs, pipe tops and isolated crate tops otherwise become "walkable").
  const seeds = [];
  for (const sp of [...SPAWNS.BLUE, ...SPAWNS.RED]) {
    const list = heightsAt(Math.floor(sp.pos[0]), Math.floor(sp.pos[2]));
    for (const c of list) if (Math.abs(c.h - sp.pos[1]) < 1.2) seeds.push(c);
  }
  const reachableRoots = new Set(seeds.map((c) => find(c.idx)));

  const compSize = new Map();
  for (const c of cells) {
    const r = find(c.idx);
    compSize.set(r, (compSize.get(r) || 0) + 1);
  }

  const kept = cells.filter((c) => {
    const r = find(c.idx);
    if (!reachableRoots.has(r)) return false;
    return compSize.get(r) >= MIN_COMPONENT;
  });
  for (const c of kept) c.comp = find(c.idx);

  // ---- corner heights averaged per (corner, component) => guaranteed welding
  const cornerSum = new Map();
  const cornerCount = new Map();
  const ckey = (ix, iz, comp) => `${ix}|${iz}|${comp}`;
  for (const c of kept) {
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const k = ckey(c.ix + dx, c.iz + dz, c.comp);
      cornerSum.set(k, (cornerSum.get(k) || 0) + c.h);
      cornerCount.set(k, (cornerCount.get(k) || 0) + 1);
    }
  }
  const cornerH = (ix, iz, comp) => {
    const k = ckey(ix, iz, comp);
    return cornerSum.get(k) / cornerCount.get(k);
  };

  // ---- emit geometry
  const positions = [];
  for (const c of kept) {
    const x0 = c.ix;
    const x1 = c.ix + 1;
    const z0 = c.iz;
    const z1 = c.iz + 1;
    const y00 = cornerH(c.ix, c.iz, c.comp) + 0.02;
    const y01 = cornerH(c.ix, c.iz + 1, c.comp) + 0.02;
    const y11 = cornerH(c.ix + 1, c.iz + 1, c.comp) + 0.02;
    const y10 = cornerH(c.ix + 1, c.iz, c.comp) + 0.02;
    // two CCW triangles seen from above (matches three-pathfinding expectations)
    positions.push(x0, y00, z0, x0, y01, z1, x1, y11, z1);
    positions.push(x0, y00, z0, x1, y11, z1, x1, y10, z0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();

  _geometry = geo;
  _cells = kept;
  _cellMap = cellMap;
  _pathfinding = new Pathfinding();
  _zoneData = Pathfinding.createZone(geo, 0.01);
  _pathfinding.setZoneData(ZONE, _zoneData);

  const comps = new Set(kept.map((c) => c.comp));
  _stats = {
    cells: kept.length,
    droppedCells: cells.length - kept.length,
    components: comps.size,
    groups: _zoneData.groups.length,
    polys: _zoneData.groups.reduce((a, g) => a + g.length, 0),
    vertices: _zoneData.vertices.length,
  };
  return _pathfinding;
}

export function buildNavMesh() {
  if (_pathfinding) return _pathfinding;
  return bake();
}

/** Drop the baked mesh so the next query rebuilds against the new map. */
export function invalidateNavMesh() {
  _pathfinding = null;
  _zoneData = null;
  _geometry = null;
  _cells = null;
  _cellMap = null;
  _stats = null;
  indexSolids();
}
onMapChange(() => invalidateNavMesh());

export function getPathfinding() {
  return _pathfinding || buildNavMesh();
}

export function getNavGeometry() {
  if (!_geometry) buildNavMesh();
  return _geometry;
}

export function navStats() {
  if (!_stats) buildNavMesh();
  return _stats;
}

// ------------------------------------------------------------------ queries
const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();

/** Group id for a world point (never throws). */
export function groupFor(pos) {
  const pf = getPathfinding();
  _va.set(pos[0], pos[1], pos[2]);
  const g = pf.getGroup(ZONE, _va, true);
  return g == null ? pf.getGroup(ZONE, _va, false) : g;
}

/**
 * Resolve an arbitrary world point onto the navmesh.
 * Returns { group, point } where `point` is guaranteed to satisfy
 * three-pathfinding's strict in-polygon test (it uses a node centroid when the
 * raw point sits inside geometry — e.g. a goal chosen on top of a crate).
 */
function resolvePoint(pos) {
  const pf = getPathfinding();
  const v = new THREE.Vector3(pos[0], pos[1], pos[2]);
  const group = pf.getGroup(ZONE, v, false);
  if (group == null) return null;
  const strict = pf.getClosestNode(v, ZONE, group, true);
  if (strict) return { group, point: v, node: strict };
  const loose = pf.getClosestNode(v, ZONE, group, false);
  if (!loose) return null;
  return { group, point: loose.centroid.clone(), node: loose };
}

/**
 * Compute a path between two world points.
 * Endpoints are snapped onto the mesh, and cross-group requests degrade to a
 * best-effort path toward the closest reachable node instead of failing.
 * @returns {number[][]|null} array of [x,y,z] waypoints
 */
export function findPath(from, to) {
  const pf = getPathfinding();
  const a = resolvePoint(from);
  if (!a) return null;
  let b = resolvePoint(to);
  if (!b) return null;

  if (a.group !== b.group) {
    // Different islands: head for the point in our own group nearest the goal.
    const target = new THREE.Vector3(to[0], to[1], to[2]);
    const node = pf.getClosestNode(target, ZONE, a.group, false);
    if (!node) return null;
    b = { group: a.group, point: node.centroid.clone(), node };
  }

  let path = null;
  try {
    path = pf.findPath(a.point, b.point, ZONE, a.group);
  } catch {
    return null;
  }
  if (!path || !path.length) {
    // Same polygon (or degenerate) — a direct step is still valid.
    return [[b.point.x, b.point.y, b.point.z]];
  }
  return path.map((p) => [p.x, p.y, p.z]);
}

/** Nearest valid navmesh position to an arbitrary point. */
export function clampToNav(pos) {
  const r = resolvePoint(pos);
  if (!r) return pos;
  return [r.point.x, r.point.y, r.point.z];
}

/** Is this point close enough to the mesh to be a sane goal? */
export function isOnNav(pos, tolerance = 1.6) {
  const r = resolvePoint(pos);
  if (!r) return false;
  return Math.hypot(r.point.x - pos[0], r.point.z - pos[2]) < tolerance;
}

/** Off-mesh ladder links (PRD §9 ladder shortcut). */
export function ladderNear(pos, maxDist = 1.5) {
  for (const l of LADDERS) {
    const dx = pos[0] - (l.min[0] + l.max[0]) / 2;
    const dz = pos[2] - (l.min[2] + l.max[2]) / 2;
    if (Math.hypot(dx, dz) < maxDist && pos[1] < l.max[1]) return l;
  }
  return null;
}

export { LEVEL, NAV_REGIONS };
