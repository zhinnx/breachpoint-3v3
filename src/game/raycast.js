/**
 * BREACHPOINT — Deterministic AABB world raycasting.
 *
 * Rapier owns character collision, but hitscan / AI vision / grenade bounces run
 * against a flat AABB list (steelfall.SOLIDS). That keeps the *simulation* free of
 * renderer + physics coupling, which PRD §15 demands ("arsitektur game-state
 * dipisah dari rendering") and makes results reproducible for future netcode.
 */
import { SOLIDS } from './steelfall.js';
import { onMapChange } from './mapRegistry.js';

// Spatial hash over XZ so a ray doesn't test all ~400 brushes.
const CELL = 6;
const grid = new Map();

function key(cx, cz) {
  return cx * 4096 + cz;
}

function buildGrid() {
  grid.clear();
  for (let i = 0; i < SOLIDS.length; i++) {
    const s = SOLIDS[i];
    const cx0 = Math.floor(s.min[0] / CELL);
    const cx1 = Math.floor(s.max[0] / CELL);
    const cz0 = Math.floor(s.min[2] / CELL);
    const cz1 = Math.floor(s.max[2] / CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const k = key(cx, cz);
        let arr = grid.get(k);
        if (!arr) grid.set(k, (arr = []));
        arr.push(i);
      }
    }
  }
}
buildGrid();
// A stale spatial hash after a map switch would silently break line-of-sight
// and hitscan, so rebuild it whenever the active map changes.
onMapChange(() => buildGrid());

const _visited = new Set();

/**
 * Slab-method ray/AABB. Returns t of entry or -1.
 * Also reports which axis was crossed so we can build a normal.
 */
function rayAABB(ox, oy, oz, dx, dy, dz, min, max, maxT) {
  let tmin = 0;
  let tmax = maxT;
  let axis = 0;
  let sign = 1;

  // X
  if (Math.abs(dx) < 1e-8) {
    if (ox < min[0] || ox > max[0]) return -1;
  } else {
    const inv = 1 / dx;
    let t1 = (min[0] - ox) * inv;
    let t2 = (max[0] - ox) * inv;
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = 0; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  // Y
  if (Math.abs(dy) < 1e-8) {
    if (oy < min[1] || oy > max[1]) return -1;
  } else {
    const inv = 1 / dy;
    let t1 = (min[1] - oy) * inv;
    let t2 = (max[1] - oy) * inv;
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = 1; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  // Z
  if (Math.abs(dz) < 1e-8) {
    if (oz < min[2] || oz > max[2]) return -1;
  } else {
    const inv = 1 / dz;
    let t1 = (min[2] - oz) * inv;
    let t2 = (max[2] - oz) * inv;
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = 2; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin >= 0 ? tmin + axis * 0 + (sign * 0) : -1;
}

/** Full traversal version that also yields axis/sign for normals. */
function rayAABBFull(ox, oy, oz, dx, dy, dz, min, max, maxT, out) {
  let tmin = 0;
  let tmax = maxT;
  let axis = -1;
  let sign = 1;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < min[i] || o[i] > max[i]) return false;
      continue;
    }
    const inv = 1 / d[i];
    let t1 = (min[i] - o[i]) * inv;
    let t2 = (max[i] - o[i]) * inv;
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = i; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  if (tmin < 0 || tmin > maxT) return false;
  out.t = tmin;
  out.axis = axis;
  out.sign = sign;
  return true;
}

const _hitTmp = { t: 0, axis: -1, sign: 1 };

/**
 * Cast a ray against static world geometry.
 * @returns {{hit:boolean, t:number, point:number[], normal:number[], surf:string}}
 */
export function castWorld(origin, dir, maxDist = 200) {
  const [ox, oy, oz] = origin;
  const [dx, dy, dz] = dir;

  let bestT = maxDist;
  let bestSolid = null;
  let bestAxis = -1;
  let bestSign = 1;

  // DDA over the XZ grid.
  _visited.clear();
  let cx = Math.floor(ox / CELL);
  let cz = Math.floor(oz / CELL);
  const stepX = dx > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = Math.abs(dx) < 1e-8 ? Infinity : Math.abs(CELL / dx);
  const tDeltaZ = Math.abs(dz) < 1e-8 ? Infinity : Math.abs(CELL / dz);
  let tMaxX = Math.abs(dx) < 1e-8
    ? Infinity
    : (((dx > 0 ? cx + 1 : cx) * CELL) - ox) / dx;
  let tMaxZ = Math.abs(dz) < 1e-8
    ? Infinity
    : (((dz > 0 ? cz + 1 : cz) * CELL) - oz) / dz;

  let travelled = 0;
  let guard = 0;
  while (travelled <= maxDist && guard++ < 512) {
    const arr = grid.get(key(cx, cz));
    if (arr) {
      for (let i = 0; i < arr.length; i++) {
        const idx = arr[i];
        if (_visited.has(idx)) continue;
        _visited.add(idx);
        const s = SOLIDS[idx];
        if (rayAABBFull(ox, oy, oz, dx, dy, dz, s.min, s.max, bestT, _hitTmp)) {
          if (_hitTmp.t < bestT) {
            bestT = _hitTmp.t;
            bestSolid = s;
            bestAxis = _hitTmp.axis;
            bestSign = _hitTmp.sign;
          }
        }
      }
    }
    if (bestSolid && bestT < travelled) break;
    if (tMaxX < tMaxZ) {
      travelled = tMaxX;
      tMaxX += tDeltaX;
      cx += stepX;
    } else {
      travelled = tMaxZ;
      tMaxZ += tDeltaZ;
      cz += stepZ;
    }
    if (!isFinite(travelled)) break;
  }

  if (!bestSolid) {
    return { hit: false, t: maxDist, point: [ox + dx * maxDist, oy + dy * maxDist, oz + dz * maxDist], normal: [0, 1, 0], surf: 'concrete' };
  }
  const n = [0, 0, 0];
  if (bestAxis >= 0) n[bestAxis] = bestSign;
  else n[1] = 1;
  return {
    hit: true,
    t: bestT,
    point: [ox + dx * bestT, oy + dy * bestT, oz + dz * bestT],
    normal: n,
    surf: bestSolid.surf,
  };
}

/** Fast boolean line-of-sight test between two points. */
export function hasLineOfSight(a, b, pad = 0) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return true;
  const inv = 1 / len;
  const r = castWorld(a, [dx * inv, dy * inv, dz * inv], len - pad);
  return !r.hit;
}

/** Point-vs-world overlap (used by grenade resting + smoke placement). */
export function pointInSolid(p, pad = 0) {
  for (let i = 0; i < SOLIDS.length; i++) {
    const s = SOLIDS[i];
    if (
      p[0] > s.min[0] - pad && p[0] < s.max[0] + pad &&
      p[1] > s.min[1] - pad && p[1] < s.max[1] + pad &&
      p[2] > s.min[2] - pad && p[2] < s.max[2] + pad
    ) return true;
  }
  return false;
}

/** Ground height directly under a point (for nav sampling / grenade rest). */
export function groundHeightAt(x, z, fromY = 30) {
  const r = castWorld([x, fromY, z], [0, -1, 0], fromY + 5);
  return r.hit ? r.point[1] : 0;
}

/**
 * Sphere-swept-ish AABB resolve for grenades (cheap: axis push-out).
 * Returns corrected position + reflected velocity.
 */
export function resolveSphere(pos, vel, radius, restitution = 0.42, friction = 0.72) {
  let [px, py, pz] = pos;
  let [vx, vy, vz] = vel;
  let grounded = false;
  let bounced = false;

  for (let i = 0; i < SOLIDS.length; i++) {
    const s = SOLIDS[i];
    // closest point on AABB
    const cxp = Math.max(s.min[0], Math.min(px, s.max[0]));
    const cyp = Math.max(s.min[1], Math.min(py, s.max[1]));
    const czp = Math.max(s.min[2], Math.min(pz, s.max[2]));
    const dx = px - cxp;
    const dy = py - cyp;
    const dz = pz - czp;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= radius * radius) continue;

    let nx = dx, ny = dy, nz = dz;
    let d = Math.sqrt(d2);
    if (d < 1e-6) {
      // deep inside: push out along the shallowest axis
      const ox1 = px - s.min[0], ox2 = s.max[0] - px;
      const oy1 = py - s.min[1], oy2 = s.max[1] - py;
      const oz1 = pz - s.min[2], oz2 = s.max[2] - pz;
      const m = Math.min(ox1, ox2, oy1, oy2, oz1, oz2);
      nx = ny = nz = 0;
      if (m === ox1) nx = -1; else if (m === ox2) nx = 1;
      else if (m === oy1) ny = -1; else if (m === oy2) ny = 1;
      else if (m === oz1) nz = -1; else nz = 1;
      d = 0.0001;
    } else {
      nx /= d; ny /= d; nz /= d;
    }
    const pen = radius - d;
    px += nx * pen;
    py += ny * pen;
    pz += nz * pen;

    const vn = vx * nx + vy * ny + vz * nz;
    if (vn < 0) {
      vx -= (1 + restitution) * vn * nx;
      vy -= (1 + restitution) * vn * ny;
      vz -= (1 + restitution) * vn * nz;
      vx *= friction; vz *= friction;
      bounced = true;
    }
    if (ny > 0.5) grounded = true;
  }
  return { pos: [px, py, pz], vel: [vx, vy, vz], grounded, bounced };
}

export const RAY_SURFACES = SOLIDS.length;
